import {template, Element} from './riot-ts';

export class ComponentBase extends Element{
    constructor(){
        super();

        ComponentBase.onInitialize.call(this);
    }

    static onInitialize(){
        var _this = (<any>this) as ComponentBase;

        if(_this.opts.width) {
            _this.root.style.width = _this.opts.width;
        }

        if(_this.opts.height){
            _this.root.style.height = _this.opts.height;
        }
    }
}