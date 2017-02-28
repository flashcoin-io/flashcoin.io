import {riot} from '../components/ts/riot-ts';
import store from './store';

import ActivityService from './activity-service';
import UserService from './user-service';

export const TABS = {
    SET_ACTIVE: 'TABS.SET_ACTIVE'
};

export const COMMONS = {
    TOGGLE_LOADING: 'COMMONS.TOGGLE_LOADING'
};

export const USERS = {
    LOGIN: 'USERS.LOGIN',
    LOGIN_SUCCESS: 'USERS.LOGIN_SUCCESS',
    LOGIN_FAILED: 'USERS.LOGIN_FAILED',
    LOGOUT: 'USERS.LOGOUT',
    SSO_LOGIN_SUCCESS: 'USERS.SSO_LOGIN_SUCCESS',
    SSO_LOGIN_FAILED: 'USERS.SSO_LOGIN_FAILED',
    GET_PROFILE_SUCCESS: 'USERS.GET_PROFILE_SUCCESS',
    GET_PROFILE_FAILED: 'USERS.GET_PROFILE_FAILED',
    REMEMBER_ME: 'USERS.REMEMBER_ME',
    SAVE_ACCESS_TOKEN: 'USERS.SAVE_ACCESS_TOKEN',
    REMOVE_ACCESS_TOKEN: 'USERS.REMOVE_ACCESS_TOKEN'
};

export const ACTIVITIES = {
    SET_ACTIVE_TAB: 'ACTIVITIES.SET_ACTIVE_TAB',
    GET_MORE_TXN: 'ACTIVITIES.GET_MORE_TXN',
    GET_MORE_TXN_SUCCESS: 'ACTIVITIES.GET_MORE_TXN_SUCCESS',
    GET_MORE_TXN_FAILED: 'ACTIVITIES.GET_MORE_TXN_FAILED'
};

export const tabActions = {
    setActive(id){
        return {type: TABS.SET_ACTIVE, data: id};
    }
};

export const routeActions = {
    route(id){
    }
};

export const commonActions = {
    toggleLoading(isLoading){
        return {type: COMMONS.TOGGLE_LOADING, data: isLoading};
    }
};

export const userActions = {
    login(email, password) {
        return (dispatch) => {
            dispatch(commonActions.toggleLoading(true));

            UserService.singleton().login(email, password).then((resp) => {
                dispatch(commonActions.toggleLoading(false));

                if(resp.rc === 1){
                    dispatch(userActions.loginSuccess(resp.profile));
                    dispatch(userActions.saveAccessToken());
                    dispatch(userActions.getProfile());
                }
                else {
                    dispatch(userActions.loginFailed(resp));
                }
            });
        };
    },
    loginFailed(error){
        return {type: USERS.LOGIN_FAILED, data: {error}};
    },
    loginSuccess(user){
        return {type: USERS.LOGIN_SUCCESS, data: user};
    },
    logout(){
        return (dispatch) => {
            dispatch(userActions.removeAccessToken());
            dispatch(userActions._logout());
        };
    },
    _logout(){
        return {type: USERS.LOGOUT};
    },
    getProfile(){
        return (dispatch) => {
            UserService.singleton().getProfile().then((resp) => {
                console.log('+++++ get_profile resp = ' + JSON.stringify(resp));

                if(resp.rc === 1){
                    dispatch(userActions.getProfileSuccess(resp.profile));
                }
                else {
                    dispatch(userActions.getProfileFailed(resp));
                }
            });
        };
    },
    getProfileSuccess(profile){
        return {type: USERS.GET_PROFILE_SUCCESS, data: profile};
    },
    getProfileFailed(resp){
        return {type: USERS.GET_PROFILE_FAILED, data: resp};
    },
    rememberMe(remember){
        return {type: USERS.REMEMBER_ME, data: remember};
    },
    ssoLogin(){
        return (dispatch) => {
            dispatch(commonActions.toggleLoading(true));

            UserService.singleton().ssoLogin().then((resp) => {
                dispatch(commonActions.toggleLoading(false));

                if(resp){
                    if(resp.rc == 1){
                        dispatch(userActions.ssoLoginSuccess(resp.profile));
                        dispatch(userActions.getProfile());
                    }
                    else{
                        dispatch(userActions.ssoLoginFailed(resp));
                    }
                }
            });
        };
    },
    ssoLoginSuccess(profile){
        return {type: USERS.SSO_LOGIN_SUCCESS, data: profile};
    },
    ssoLoginFailed(resp){
        return {type: USERS.SSO_LOGIN_FAILED, data: resp};
    },
    saveAccessToken(token){
        var state = store.getState();
        var user = state.userData.user;

        if (user) localStorage.setItem('access_token', user.idToken);

        return {type: USERS.SAVE_ACCESS_TOKEN};
    },
    removeAccessToken(){
        localStorage.removeItem('access_token');

        return {type: USERS.REMOVE_ACCESS_TOKEN};
    }
};

export const activityActions = {
    setActiveTab(tabId){
        return {type: ACTIVITIES.SET_ACTIVE_TAB, data: tabId};
    },
    getMoreTxns(pageSettings){
        let {date_from, date_to, type, start, size = 10, order = 'desc'} = pageSettings;
        
        return (dispatch) => {
            dispatch(commonActions.toggleLoading(true));

            ActivityService.singleton().getTransList(pageSettings).then((resp) => {
                dispatch(commonActions.toggleLoading(false));

                if(resp.rc == 1){
                    dispatch(activityActions.getMoreTxnsSuccess(resp));
                }
                else{
                    dispatch(activityActions.getMoreTxnsFailed(resp));
                }
            });
        };
    },
    getMoreTxnsSuccess(resp){
        return {type: ACTIVITIES.GET_MORE_TXN_SUCCESS, data: resp};
    },
    getMoreTxnsFailed(resp){
        return {type: ACTIVITIES.GET_MORE_TXN_FAILED, data: resp};
    }
};
