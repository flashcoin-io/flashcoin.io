import * as redux from 'redux';
import thunk from 'redux-thunk';
import reducers from './reducers';

interface IUser{
    email: string;
    idToken: string;
    role: string;
    res: string;
    sessionToken: string;
}

interface ITAB{
    id: string;
    name: string;
    isActive: boolean;
}

export interface ApplicationState {
    lastAction: {type: string, data: any},
    userData: {user: IUser},
    commonData: {isLoading: boolean},
    tabData: {tabs: ITAB[]}
}

// var createStoreWithMiddleware = redux.compose(
//     redux.applyMiddleware(thunk)
// )(redux.createStore);

const logger = store => next => action => {
  console.log('dispatching', action)
  let result = next(action)
  console.log('next state', store.getState())
  return result
}

const crashReporter = store => next => action => {
  try {
    return next(action)
  } catch (err) {
    console.error('Caught an exception!', err);
    throw err
  }
}

var store = redux.createStore(reducers, redux.applyMiddleware(thunk, logger)) as redux.Store<ApplicationState>;
//var store = createStoreWithMiddleware(reducers) as redux.Store<ApplicationState>;

export default store;
