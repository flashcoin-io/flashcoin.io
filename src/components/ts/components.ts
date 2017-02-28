import {riot, template, Element} from './riot-ts';

import LandingPage from './landing-page';
import Home from './home/index';
import HomeHeader from './home/header';
import LoadingIndicator from './loading-indicator';
import App from './app';

//import * as templates from '../templates/templates';

export {LoadingIndicator, LandingPage, Home, HomeHeader, App};

export function initialize(){
    riot.mount('*');
}





