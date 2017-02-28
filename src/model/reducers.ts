import * as redux from 'redux';
import {COMMONS, USERS, ROUTES, TABS, ACTIVITIES} from './actions';

var tabs = [
    {id: 'activity', name: 'Activity', isActive: true},
    {id: 'send', name: 'Send', isActive: false},
    {id: 'request', name: 'Request', isActive: false},
    {id: 'pending', name: 'Pending', isActive: false},
    {id: 'contacts', name: 'Contacts', isActive: false},
    {id: 'profile', name: 'My Account', isActive: false}
];
function tabReducer(state = {tabs: tabs}, action){
    switch(action.type){
        case TABS.SET_ACTIVE:
            var oldList = state.tabs;
            var newList = oldList.map((tab) => {
                tab.isActive = (tab.id == action.data);
                return tab;
            });

            return Object.assign({}, state, {tabs: newList});
        default:
            return state;
    }
}

function userReducer(state = {user: null}, action){
    switch(action.type){
        case USERS.LOGIN_SUCCESS:
        case USERS.SSO_LOGIN_SUCCESS:
            return Object.assign({}, state, {user: action.data});
        case USERS.LOGOUT:
            return Object.assign({}, state, {user: null});
        case USERS.GET_PROFILE_SUCCESS:
            var oldProfile = state.user;
            var newProfile = Object.assign({}, oldProfile, action.data);
            return Object.assign({}, state, {user: newProfile});
        case USERS.REMEMBER_ME:
            return Object.assign({}, state, {rememberMe: action.data});
        default:
            return state;
    }
}

function commonReducer(state = {isLoading: false}, action) {
    switch (action.type) {
        case COMMONS.TOGGLE_LOADING:
            return Object.assign({}, state, {isLoading: action.data});
        default:
            return state;
    }
}

function lastAction(state = null, action) {
    return action;
}

var homeTabs = [
    {id: 0, code: 'ALL', name: 'All Transactions', isActive: true},
    {id: 1, code: 'RECEIVED', name: 'Payments Received', isActive: false},
    {id: 2, code: 'SENT', name: 'Payments Sent', isActive: false}
];

function activityReducer(state = {txns: [], total_txns: 0, page_size: 5, tabs: homeTabs}, action){
    switch(action.type){
        case ACTIVITIES.GET_MORE_TXN_SUCCESS:
            var txns = action.data.txns || [];
            return Object.assign({}, state, {txns: txns, total_txns: action.data.total_txns});
        case ACTIVITIES.SET_ACTIVE_TAB:
            var oldList = state.tabs;
            var newList = oldList.map((tab) => {
                tab.isActive = (tab.id == action.data);
                return tab;
            });
            return Object.assign({}, state, {tabs: newList});
        default:
            return state;
    }
}

const reducers = redux.combineReducers({
    lastAction: lastAction,
    userData: userReducer,
    commonData: commonReducer,
    tabData: tabReducer,
    activityData: activityReducer
});

export default reducers;
