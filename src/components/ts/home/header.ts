import * as andamanService from '../../../services/andaman-service';
import {template, Element} from '../riot-ts';
import store, {ApplicationState}  from '../../../model/store';
import * as actions from '../../../model/actions';
import * as templates from '../../templates/templates';

@template(templates.HomeHeaderTemplate)
export default class HomeHeader extends Element {
    public userEmail: string = store.getState().userData.user.email;
    public avatarUrl: string = `http://${andamanService.opts.host}/profile/${store.getState().userData.user.profile_pic_url}`;

    mounted() {
        let state = store.getState();
        store.subscribe(this.onApplicationStateChanged.bind(this));

    }

    onApplicationStateChanged() {
        var state: ApplicationState = store.getState();

    }

    onLogoutButtonClick(event: Event) {
        event.preventDefault();
        event.stopPropagation();

        store.dispatch(actions.userActions.logout());

    }


}
