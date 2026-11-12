import http from 'k6/http';
import {check,sleep} from 'k6';
if(!__ENV.BASE_URL)throw new Error('Set BASE_URL to your own test site.');
export const options={stages:[{duration:'30s',target:10},{duration:'1m',target:50},{duration:'30s',target:0}],thresholds:{http_req_duration:['p(95)<500'],http_req_failed:['rate<0.01'],checks:['rate>0.99']}};
export default function(){const r=http.get(__ENV.BASE_URL+'/');check(r,{'HTTP 200':r=>r.status===200});sleep(1);}
