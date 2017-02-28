import {riot, template, Element} from '../riot-ts';
import store, {ApplicationState} from '../../../model/store';
import * as actions from '../../../model/actions';
import * as templates from '../../templates/templates';

@template(templates.HomeActivityTemplate)
export default class HomeActivity extends Element{
    private fromDateObject;
    private toDateObject;
    private paginationObject;
    private pageIndex = 0;

    private DATE_PICKER_FORMAT = "MMM DD, YYYY";

    public txns = [];
    public tabs = store.getState().activityData.tabs;

    constructor(){
        super();
    }

    mounted(){
        var state = store.getState();

        store.subscribe(this.onApplicationStateChanged.bind(this));

        UIkit.ready(() => {
            this.initDatePickers();
            this.loadTxns();
        });
    }

    unmounted(){
        this.fromDateObject = null;
        this.toDateObject = null;
        this.paginationObject = null;
    }

    initDatePickers(){
        var state = store.getState();
        
        var fromDateInput = this.root.querySelector('.activity-from-date');
        var toDateInput = this.root.querySelector('.activity-to-date');
        var dateOpts = {format: this.DATE_PICKER_FORMAT};

        var moment = UIkit.Utils.moment;

        this.fromDateObject = UIkit.datepicker(fromDateInput, dateOpts);
        this.toDateObject = UIkit.datepicker(toDateInput, dateOpts);

        var format = this.DATE_PICKER_FORMAT;

        var fromData = moment(state.userData.user.created_ts);
        var toData = moment();

        var fromString = fromData.format(format);
        var toString = toData.format(format);

        this.fromDateObject.element.val(fromString);
        this.toDateObject.element.val(toString);

        this.fromDateObject.current = fromData;
        this.toDateObject.current = toData;
    }

    buildPagination(){
        var state = store.getState();
        var {total_txns, page_size} = state.activityData;
        var pagination = this.paginationObject;

        if(!pagination) {
            var paginationEl = this.root.querySelector('.txn-pagination');
            pagination = UIkit.pagination(paginationEl, {items: total_txns, itemsOnPage: page_size, currentPage: this.pageIndex});
            pagination.on('select.uk.pagination', (e, pageIndex) => {
                this.pageIndex = pageIndex;
                this.loadTxns();
            });
            this.paginationObject = pagination;
        }
        else {
            var opts = pagination.options;
            if(opts.items != total_txns || opts.itemsOnPage != page_size){
                opts.items = total_txns;
                opts.itemsOnPage = page_size;

                var pages = Math.ceil(opts.items / opts.itemsOnPage);
                pagination.render(pages);
            }
        }
    }

    loadTxns(){
        var data = store.getState().activityData;

        var pageSize = data.page_size;
        var fromDate = this.fromDateObject.current.toISOString();
        var toDate = this.toDateObject.current.toISOString();

        var activeTab = data.tabs.filter((tab) => {
            return tab.isActive;
        })[0];
        var type = activeTab ? activeTab.id : 0;

        var pageSettings = {
            type: type,
            date_from: fromDate,
            date_to: toDate,
            start: this.pageIndex * pageSize,
            size: pageSize,
            order: 'desc'
        };

        store.dispatch(actions.activityActions.getMoreTxns(pageSettings));
    }

    reloadTxns(){
        this.pageIndex = 0;

        var state = store.getState();
        var {total_txns, page_size} = state.activityData;

        var pagination = this.paginationObject;
        var opts = pagination.options;
        opts.items = total_txns;
        opts.itemsOnPage = page_size;

        var pages = Math.ceil(opts.items / opts.itemsOnPage);
        
        pagination.selectPage(this.pageIndex, pages);
    }

    onApplicationStateChanged(){
        var state = store.getState();
        var data = state.activityData;
        var type = state.lastAction.type;

        if(type == actions.ACTIVITIES.GET_MORE_TXN_SUCCESS){
            this.buildPagination();
            this.txns = data.txns;
            this.tabs = data.tabs;
            this.update();
        }
    }

    getDisplayDate(date){
        var moment = UIkit.Utils.moment;
        return moment(date).format(this.DATE_PICKER_FORMAT);
    }

    onShowButtonClick(event: Event){
        this.reloadTxns();
    }

    onShowAllButtonClick(event: Event){
        this.initDatePickers();
        this.reloadTxns();
    }

    onTabItemClick(event: Event){
        event.preventDefault();
        event.stopPropagation();

        store.dispatch(actions.activityActions.setActiveTab(event.item.tabItem.id));
        this.reloadTxns();
    }
}

declare var UIkit: {$: Function, ready: (cb: Function) => {}, datepicker: Function};