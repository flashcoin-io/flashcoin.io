import * as AndamanService from '../services/andaman-service';

export default class ActivityService{
    constructor(){

    }

    getTransList(pageSettings){
        return new Promise((resolve) => {
            AndamanService.ready().then((opts) => {
                let {date_from, date_to, type, start, size = 10, order = 'desc'} = pageSettings;
                
                var andaman = opts.andaman;
                var pipe = opts.pipe;

                var credentials = {
                    date_from: date_from,
                    date_to: date_to,
                    type: type,
                    start: start,
                    size: size,
                    order: order
                };

                andaman.get_txns(pipe, credentials, (resp) => {
                    resolve(resp);
                });
            });
        });
    }

    private static _instance: ActivityService;
    static singleton(){
        if(!ActivityService._instance) {
            ActivityService._instance = new ActivityService();
        }

        return ActivityService._instance;
    }
}