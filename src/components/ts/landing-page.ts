import {template, Element} from './riot-ts';
import store from '../../model/store';
import * as actions from '../../model/actions';
import * as templates from '../templates/templates';

@template(templates.LandingPageTemplate)
export default class LandingPage extends Element{
    mounted(){
        store.subscribe(this.onApplicationStateChanged.bind(this));
    }

    onApplicationStateChanged(){
        
    }

    onLoginButtonClick(event: Event){
        event.preventDefault();
        event.stopPropagation();

        var emailField = <HTMLInputElement>this.root.querySelector('.login-email');
        var passwordField = <HTMLInputElement>this.root.querySelector('.login-password');
        this.doLogin(emailField.value, passwordField.value);
    }

    onSignupButtonClick(event: Event){
        throw new Error("Not implemented yet.");
    }

    doLogin(email, password) {
        store.dispatch(actions.userActions.login(email, password));
    }

    onRememberMeCheckBoxChange(event: Event){
        store.dispatch(actions.userActions.rememberMe(event.target.checked));
    }
}
