import {riot, template, Element} from '../riot-ts';
import store, {ApplicationState} from '../../../model/store';
import * as actions from '../../../model/actions';
import * as templates from '../../templates/templates';

@template(templates.HomeSendTemplate)
export default class HomeSend extends Element{
}