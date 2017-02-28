
import {utils, uuid, config} from '../common/common';
import EventService from './bus';
import AndamanService from './andaman';

export default class SSO{
    constructor(bus, andamanService){
        this.andamanService = andamanService;
        this.bus = bus;

        this.service = createService(this.andamanService, this.bus);
        this.initPromise = null;
    }

    ready() {
        if(this.initialized) return Promise.resolve();
        if(this.initPromise) return this.initPromise;

        return new Promise((resolve, reject) => {
            this.initPromise = this.service.init().then(() => {
                return this.service.onGetUser().then((usr) => {
                    this.initPromise = null;
                    this.initialized = true;
                    resolve();
                    console.log(usr);
                });
            });
        });
    }

    onGetUser(){
        return this.service.onGetUser();
    }

    onLogin(data){
        return this.service.onLogin(data);
    }

    get user(){return this.service.getUser();}

    static singleton(){
        if(SSO._instance) return SSO._instance;

        var bus = EventService.singleton();
        var andaman = AndamanService.singleton();

        SSO._instance = new SSO(bus, andaman);

        return SSO._instance;
    }
}
/**
 * Created by kang on 3/6/16.
 */

function createService (andaman, bus) {
    var sandbox = {
        _data: {},
        get: function(key){
            return this._data[key];
        },
        set: function(key, val, force){
            this._data[key] = val;
        }
    };

    var isMonitoringToken = false;
    var firstToken = null, lastToken = null;
    var casReadyPromise = null;

    var casURL;
    switch (config.andaman_server.host) {
        case 'chat.seen.life':
            casURL = 'https://cas.unseen.is';
            break;
        case 'qachat.seen.life':
            casURL = 'https://qacas.unseen.is';
            break;
        default:
            casURL = 'https://qacas.unseen.is';
            break;
    }

    return {
        init: function () {
            var that = this;
            return new Promise(function (resolve) {
                bus
                    .on('sso.onLogin', that.onLogin.bind(that))
                    .on('sso.onTokenLogin', that.onTokenLogin.bind(that))
                    .on('sso.onGetToken', that.onGetToken.bind(that))
                    .on('sso.onSetToken', that.onSetToken.bind(that))
                    .on('sso.onGetUser', that.onGetUser.bind(that))
                    .on('andaman.on_session_failed', function(resp){
                        if(resp == 'jwt expired'){
                            that.onCasReady();
                        }
                    });

                resolve();
            });
        },
        startMonitoringToken: function () {
            if (isMonitoringToken) return;
            isMonitoringToken = true;
            return setTimeout(this.doMonitoringToken.bind(this), 5000);
        },
        doMonitoringToken: function () {
            var that = this;
            that.onGetToken().then(function (token) {
                if (!token) {
                    var event = (lastToken != null) ? 'sso.onTokenJustRemoved' : 'sso.onLoginRequired';
                    lastToken = null;
                    bus.emit(event).then(function (results) {
                        isMonitoringToken = false;
                        that.startMonitoringToken();
                    });
                }
                else {
                    if(firstToken != null && lastToken == null){
                        bus.emit('sso.onTokenJustAdded', token);
                    }

                    isMonitoringToken = false;
                    if(firstToken == null) firstToken = token;
                    lastToken = token;
                    bus.emit('sso.onGetTokenDaily', token);
                    that.startMonitoringToken();
                }
            });
        },
        onGetUser: function () {
            var that = this;
            return new Promise(function (resolve, reject) {
                var user = sandbox.get('user');
                if (user) resolve(user);
                else {
                    that.onCasReady().then(function () {
                        user = sandbox.get('user');
                        if(user) resolve(user);
                        else reject("USER_NOT_EXIST.");
                    }).catch((err) =>{
                        reject(err);
                    });
                }
            });
        },
        getUser: function(){
            return sandbox.get('user');
        },
        onCasReady: function () {
            if(casReadyPromise) return casReadyPromise;

            var that = this;
            casReadyPromise = new Promise(function (resolve, reject) {
                bus.once('sso.onGetTokenDaily', function (token) {
                    that.onTokenLogin(token).then(function (user) {
                        casReadyPromise = null;
                        sandbox.set('user', user, true);
                        bus.emit('sso.onLoggedIn', user);
                        resolve(user);
                    }).catch(function (err) {
                        casReadyPromise = null;
                        reject(err);
                    });
                });

                if(!isMonitoringToken) {
                    that.doMonitoringToken();
                    that.startMonitoringToken();
                }
            });
            return casReadyPromise;
        },
        onSetToken: function (access_token) {
            localStorage.setItem('access_token', access_token);
            return Promise.resolve();
        },
        onGetToken: function () {
            var that = this;
            var isResolved = false;
            return new Promise(function (resolve) {
                var token = localStorage.getItem('access_token');
                resolve(token);
            });
        },
        onTokenLogin: function (token) {
            var that = this;
            return new Promise(function (resolve, reject) {
                var data = {
                    id_token: token,
                    //user_id: localStorage.getItem('my_user_id'),
                    device_id: 'browser',
                    //device_token: window.device_token || null
                };

                andaman.users.token_login(data).then(function (resp) {
                    if (!resp.err) {
                        var user = resp.re.user;
                        that.saveUser(user);
                        that.startMonitoringToken();
                        resolve(user);
                    }
                    else
                        reject(resp.err);
                }).catch(function (err) {
                    reject(err);
                });
            });
        },
        onLogin: function (_data) {
            var that = this;
            return new Promise(function (resolve, reject) {
                var data = {
                    email: _data.email,
                    password: _data.password,
                    device_id: 'browser'
                };

                andaman.users.login(data).then((resp) => {
                    if (resp.re && resp.re.user) {
                        that.onSetToken(resp.re.id_token);

                        var user = resp.re.user;
                        that.saveUser(user);
                        that.startMonitoringToken();
                        resolve(user);
                        //that.casLogin(resp, resolve, reject);
                    } else {
                        reject(resp.err.message);
                    }
                });
            });
        },
        createUser: function (_data) {
            var num = '';
            var idx = _data.email.index('@');
            var display_name = _data.email.substr(0, idx);

            var data = {
                username: _data.email,
                phone_number: num,
                email: _data.email,
                user_id: uuid.v1(new Date(utils.get_sending_time()).valueOf()),
                password: _data.password,
                device_id: 'browser',
                display_name: display_name,
                avatar: '',
                is_gossip: 1,
                status_message: ''
            };

            return andaman.create_user(data);
        },
        saveUser: function (user) {
            // if (user.user_id != localStorage.getItem('my_user_id')) {
            //     localStorage.clear();
            //     andaman.users.set_local_credential(user);
            //     //localdb.truncate_all();
            // }

            sandbox.set('user', user, true);
        },
        casLogin: function (resp, resolve, reject) {
            this.onSetToken(resp.re.id_token);
            return this.onTokenLogin(resp.re.id_token);
        },
        deleteTokenFromCAS: function () {
            localStorage.removeItem('access_token');
        }
    };
};