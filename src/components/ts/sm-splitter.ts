import {template, Element} from './riot-ts';

import * as templates from '../templates/templates';

declare var jQuery;

@template(templates.SmSplitterTemplate)
export class SmSplitter extends Element {
    private panes: SmPane[] = null;
    private drag: boolean = false;
    private vertical: boolean = false;

    private resizeHandler: HTMLElement = null;
    private fixedPane: SmPane = null;

    private onMouseMoveDelegate: Function;
    private onHandlerMouseDownDelegate: Function;
    private onDocumentMouseUpDelegate: Function;
    private onWindowResizeDelegate: Function;

    constructor() {
        super();

        this.initialize();
    }

    mounted() {
        this.updateLayout();
        this.registerEvents();
    }

    unmounted() {
        this.removeEvents();
    }

    initialize() {
        this.onMouseMoveDelegate = this.onMouseMove.bind(this);
        this.onHandlerMouseDownDelegate = this.onHandlerMouseDown.bind(this);
        this.onDocumentMouseUpDelegate = this.onDocumentMouseUp.bind(this);
        this.onWindowResizeDelegate = this.onWindowResize.bind(this);
    }

    private updateLayout() {
        var $ = jQuery;

        var rootContainer = this.root.querySelector('.split-panes');
        this.panes = this.tags['sm-pane'];
        var p1 = this.panes[0];
        var p2 = this.panes[1];

        if (p1) p1.root.className = 'split-pane1';
        if (p2) p2.root.className = 'split-pane2';

        var handler = document.createElement('div');
        handler.className = 'split-handler';
        $(p1.root).after(handler);
        this.resizeHandler = handler;

        this.vertical = this.opts.orientation == 'vertical';

        this.fixedPane = (p1.size != null || p2.size == null) ? p1 : p2;

        var el1 = p1.root, el2 = p2.root;
        if (this.vertical) {
            $(el1).css({top: '0px', left: '0px', right: '0px', bottom: 'auto'});
            $(el2).css({left: '0px', right: '0px', top: 'auto', bottom: '0px'});
        }
        else{
            $(el1).css({top: '0px', bottom: '0px', left: '0px', right: 'auto'});
            $(el2).css({top: '0px', bottom: '0px', left: 'auto', right: '0px'});
        }

        var pos = this.getState();
        this.resize(pos);
    }

    private registerEvents() {
        var el = this.root.querySelector('.split-panes');
        var handler = this.resizeHandler;

        var $ = jQuery;
        $(el).on('mousemove', this.onMouseMoveDelegate);
        $(handler).on('mousedown', this.onHandlerMouseDownDelegate);
        $(document).on('mouseup', this.onDocumentMouseUpDelegate);
        //$(window).on('resize', this.onWindowResizeDelegate);
    }

    private removeEvents() {
        var el = this.root.querySelector('.split-panes');
        var handler = this.resizeHandler;

        var $ = jQuery;
        $(el).off('mousemove', this.onMouseMoveDelegate);
        $(handler).off('mousedown', this.onHandlerMouseDownDelegate);
        $(document).off('mouseup', this.onDocumentMouseUpDelegate);
        //$(window).off('resize', this.onWindowResizeDelegate);
    }

    getState() {
        var pos = { clientX: -1, clientY: -1 };
        var p1 = this.panes[0];
        var p2 = this.panes[1];

        var el = this.root.querySelector('.split-panes');
        var bounds = el.getBoundingClientRect();
        var upperBound = (this.vertical) ? bounds.bottom : bounds.right;
        var underBound = (this.vertical) ? bounds.top: bounds.left;

        if (p1 == this.fixedPane) {
            pos.clientX = underBound + (p1.size || 200);
            pos.clientY = pos.clientX;
        }
        else {
            pos.clientX = underBound + upperBound - (p2.size || 200);
            pos.clientY = pos.clientX;
        }

        return pos;
    }

    doResize(state) {
        this.resize(state);
    }

    private resize({clientX, clientY}) {
        var $ = jQuery;
        var handler = this.resizeHandler;
        var pane1 = this.panes[0];
        var pane2 = this.panes[1];

        var pane1Container: HTMLElement = pane1.root || <any>this.root.querySelector('.split-pane1');
        var pane2Container: HTMLElement = pane2.root || <any>this.root.querySelector('.split-pane2');

        var pane1Min = pane1.minSize || 200;
        var pane2Min = pane2.minSize || 200;

        var el = this.root.querySelector('.split-panes');
        var bounds = el.getBoundingClientRect();

        var pos = 0;
        var handlerBounds = handler.getBoundingClientRect();

        if (this.vertical) {
            var height = bounds.bottom - bounds.top;
            pos = clientY - bounds.top;

            if (pos < pane1Min && clientY < handlerBounds.bottom) return;
            if (height - pos < pane2Min && clientY > handlerBounds.top) return;

            

            if (pane1 == this.fixedPane) {
                pane1.size = pos;
                pane1Container.style.height = pos + 'px';
                pane2Container.style.top = pos + 'px';

                handler.style.top = pos + 'px';
                handler.style.bottom = 'auto';
            }
            else {
                pane2.size = bounds.bottom - pos;

                pane1Container.style.bottom = pane2.size + 'px';
                pane2Container.style.height = pane2.size + 'px';
                
                handler.style.bottom = pane2.size + 'px';
                handler.style.top = 'auto';
            }
        } else {
            var width = bounds.right - bounds.left;
            pos = clientX - bounds.left;

            //if (pos < pane1Min) return;
            //if (width - pos < pane2Min) return;

            if (pane1 == this.fixedPane) {
                pane1.size = pos;

                pane1Container.style.width = pos + 'px';
                pane2Container.style.left = pos + 'px';

                handler.style.left = pos + 'px';
                handler.style.right = 'auto';
            }
            else {
                pane2.size = bounds.right - pos;

                pane1Container.style.right = pane2.size + 'px';
                pane2Container.style.width = pane2.size + 'px';

                handler.style.right = pane2.size + 'px';
                handler.style.left = 'auto';
            }
        }
    }

    private onMouseMove(ev) {
        if (!this.drag) return;
        this.doResize(ev);
    }

    private onHandlerMouseDown(ev) {
        ev.preventDefault();
        this.drag = true;
    }

    private onDocumentMouseUp(ev) {
        this.drag = false;
    }

    private onWindowResize(ev: Event) {
        ev.stopPropagation();

        this.updateLayout();
    }
}

@template(templates.SmPaneTemplate)
export class SmPane extends Element {
    minSize: number = 200;
    size: number = null;

    constructor() {
        super();

        this.initialize();
    }

    initialize() {
        this.minSize = parseInt(this.opts.minSize || '200') || 200;
        if (this.opts.size) {
            var size = parseInt(this.opts.size);
            this.size = Math.max(size, this.minSize);
        }
    }
}