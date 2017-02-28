import Riot from '../../services/riot-service';

var riot: Base = <any>Riot;

export interface Settings {
      brackets: string;
}

export class Observable {
      on(events: string, callback: Function) { }
      one(events: string, callback: Function) { }
      off(events: string) { }
      trigger(eventName: string, ...args) { }

      constructor() {
            riot.observable(this);
      }
}

export interface Router {
      (callback: Function): void;
      (filter: string, callback: Function): void;
      (to: string, title?: string);

      create(): Router;
      start(autoExec?: boolean);
      stop();
      exec();
      query(): any;

      base(base: string);
      parser(parser: (path: string) => string, secondParser?: Function);
}

export interface Base {
      version: string;
      settings: Settings;
      mount(customTagSelector: string, opts?: any): Array<Element>;
      mount(selector: string, tagName: string, opts?: any): Array<Element>;
      mount(domNode: Node, tagName: string, opts?: any): Array<Element>;
      render(tagName: string, opts?: any): string;
      tag(tagName: string, html: string, css: string, attrs: string, constructor: Function);
      tag2(tagName: string, html: string, css: string, attrs: string, constructor: Function, bpair: string);
      class(element: Function): void;
      observable(object: any): void;

      mixin(mixinName: string, mixinObject: any): void;

      compile(callback: Function): void;
      compile(url: string, callback: Function): void;
      compile(tag: string): string;
      compile(tag: string, dontExecute: boolean): string;
      compile(tag: string, options: any): string;
      compile(tag: string, dontExecute: boolean, options: any): CompilerResult[];

      // TODO server-only methods

      route: Router;
}

export interface LifeCycle {
      mounted?(F: Function);
      unmounted?(F: Function);
      updating?(F: Function);
      updated?(F: Function);
}

export interface HTMLRiotElement extends HTMLElement {
      _tag: Element;
}

export interface CompilerResult {
      tagName: string;
      html: string;
      css: string;
      attribs: string;
      js: string;
}

export class Element implements Observable, LifeCycle {
      opts: any;
      parent: Element;
      root: HTMLElement;
      tags: any;
      tagName: string;
      template: string;
      isMounted: boolean;

      update(data?: any) { }
      unmount(keepTheParent?: boolean) { }
      on(eventName: string, fun: Function) { }
      one(eventName: string, fun: Function) { }
      off(events: string) { }
      trigger(eventName: string, ...args) { }
      mixin(mixinObject: Object | Function | string, instance?: any) { }

      static createElement(options?: any): HTMLRiotElement {
            var tagName = (this.prototype as any).tagName;
            var el = document.createElement(tagName);
            riot.mount(el, tagName, options);
            return el as any as HTMLRiotElement;
      }
}

export var precompiledTags: { [fileName: string]: CompilerResult } = {};
export function registerClass(element: Function) {
      function registerTag(compiledTag: CompilerResult) {

            var transformFunction = function (opts) {
                  extend(this, element);         // copies prototype into "this"                        
                  element.apply(this, [opts]);  // calls class constructor applying it on "this"

                  if (element.prototype.mounted !== undefined) this.on("mount", this.mounted);
                  if (element.prototype.unmounted !== undefined) this.on("unmount", this.unmounted);
                  if (element.prototype.updating !== undefined) this.on("update", this.updating);
                  if (element.prototype.updated !== undefined) this.on("updated", this.updated);

                  // TODO support for init(opts) ?
            };

            riot.tag2(compiledTag.tagName, compiledTag.html, compiledTag.css, compiledTag.attribs, transformFunction, riot.settings.brackets);

            return compiledTag.tagName;
      }

      function loadTemplateFromHTTP(template) {
            var req = new XMLHttpRequest();
            req.open("GET", template, false);
            req.send();
            if (req.status == 200) return req.responseText;
            else throw req.responseText;
      };

      let compiled: CompilerResult;

      // gets string template: inlined, via http request or via precompiled cache
      if (element.prototype.template !== undefined) {
            let tagTemplate = element.prototype.template;
            if (tagTemplate.indexOf("<") < 0) {
                  // tag is a file
                  if (precompiledTags[tagTemplate] !== undefined) {
                        // loads it from precompiled cache                
                        compiled = precompiledTags[tagTemplate];
                  }
                  else {
                        // loads from HTTP and compile on the fly
                        tagTemplate = loadTemplateFromHTTP(tagTemplate);
                        compiled = riot.compile(tagTemplate, true, { entities: true })[0];
                  }
            }
            else {
                  // tag is inlined, compile on the fly
                  compiled = riot.compile(tagTemplate, true, { entities: true })[0];
            }

            element.prototype.tagName = registerTag(compiled);
      }
      else throw "template property not specified";
}

// new extend, works with getters and setters
function extend(d, element) {
      var map = Object.keys(element.prototype).reduce((descriptors, key) => {
            descriptors[key] = Object.getOwnPropertyDescriptor(element.prototype, key);
            return descriptors;
      }, {}) as PropertyDescriptorMap;
      Object.defineProperties(d, map);
}

// @template decorator
export function template(template: string) {
      return function (target: Function) {
            target.prototype["template"] = template;
            registerClass(target);
      }
}

export {riot};