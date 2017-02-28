import {template, Element} from './riot-ts';
import store, {ApplicationState} from '../../model/store';
import * as actions from '../../model/actions';
import * as templates from '../templates/templates';

@template(templates.AppTemplate)
export default class App extends Element{
    state: ApplicationState = <any>{commonData: {isLoading: false}};

    constructor(){
        super();

        store.subscribe(this.onApplicationStateChanged.bind(this));
    }

    onApplicationStateChanged(){
        this.state = store.getState();
        
        this.update();
    }
}
