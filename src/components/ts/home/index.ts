import {riot, template, Element} from '../riot-ts';
import store, {ApplicationState} from '../../../model/store';

import HomeActivity from './activity';
import HomeSend from './send';
import HomeRequest from './request';

import * as actions from '../../../model/actions';
import * as templates from '../../templates/templates';

@template(templates.HomePageTemplate)
export default class HomePage extends Element{
    private route = riot.route.create();
    private lastView = null;
    private widgets = {
        'activity': 'home-activity',
        'send': 'home-send',
        'request': 'home-request'
    };

    constructor(){
        super();

        this.initialize();
    }

    initialize(){
        this.route((action) => {
            var mainContent = document.querySelector('#main-content');
            

            switch(action){
                case 'activity':
                case 'send':
                case 'request':
                    var id = this.widgets[action];
                    if(this.lastView && this.lastView.id != id) {
                        UIkit.$(this.lastView).hide();
                    }

                    var el = mainContent.querySelector('#' + id);
                    if(!el){
                        el = document.createElement('div');
                        el.id = id;
                        mainContent.appendChild(el);

                        riot.mount(el, id);
                    }
                    else{
                        $(el).show();
                    }

                    this.lastView = el;

                    store.dispatch(actions.tabActions.setActive(action));
                    break;
            }
        });

        //set default values.
        riot.route('activity');
    }
}

@template(templates.MainHeaderTemplate)
export class MainHeader extends Element{
    onLogoutButtonClick(event: Event){
        event.preventDefault();
        event.stopPropagation();

        var action = actions.userActions.logout();
        store.dispatch(action);
    }
}

@template(templates.MainNavBarTemplate)
export class MainNavBar extends Element{
    state: ApplicationState = <any>{tabData: {tabs: []}};

    constructor(){
        super();
    }

    mounted(){
        this.state = store.getState();
        this.update();

        store.subscribe(this.onApplicationStateChanged.bind(this));
    }

    onApplicationStateChanged(){
        this.state = store.getState();
        this.update();
    }

    onTabItemClick(event: Event){
        event.preventDefault();
        event.stopPropagation();

        var tab = event.item.tab;
        riot.route(tab.id);
    }

    onLogoutTabItemClick(event: Event){
        event.preventDefault();
        event.stopPropagation();

        var action = actions.userActions.logout();
        store.dispatch(action);
    }
}

export {HomeActivity, HomeSend, HomeRequest};
