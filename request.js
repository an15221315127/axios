import axios from 'axios';
import router from '@/router';
import Qs from 'qs';
import {Toast} from "vant";


var baseURL = 'http://www.localhost/api'
var token = '';
const service = axios.create({
    baseURL: baseURL, // 接口地址前缀
    timeout: 500,// 超时时间
    currentRequestList: [],// 当前同一时间内同时并行请求接口
    timeStep: 500,// 重连间隔
    currentCount: 1,//当前重连次数
    MaxReconnectionTimes: 5,// 最大重连次数
    loading: false,// 重连机制开启时所有接口都不可在同一时间平行访问
})
// 请求拦截
service.interceptors.request.use(
    config => {
        if (token) {
            config.headers.token = '该处可设置token内容';
        }
        const {submit, url} = config;
        if (submit) {
            if (service.defaults.currentRequestList.indexOf(url) > -1) {
                return Promise.reject({
                    message: `${url}正在请求，请勿重复提交`
                })
            }
            service.defaults.currentRequestList.push(url);
        }
        if (service.defaults.loading && !config.loading) {
            return Promise.reject({
                message: '当前网络不佳，正在为您拼命加载...'
            })
        }
        return config  // 对config处理完后返回，下一步将向后端发送请求
    },
    error => {  // 当发生错误时，执行该部分代码
        return Promise.reject(error)
    }
)
// 响应拦截
service.interceptors.response.use(
    response => {
        if (response.config.submit) {
            clearRequestStatus(response.config.url);
        }
        if (response.status === 200) { // 请求服务端成功
            service.defaults.currentCount = 0;
            const {data, code, msg} = response.data;
            switch (code) {// 前后端统一Code   200 成功 300 为参数缺失或者参数类型错误   400 为token过期或者登录失败
                case 200: // 成功之返回data数据
                    return Promise.resolve(data);
                case 300: // 参数错误  展示错误信息
                    Toast(msg);
                    return Promise.reject(msg);
                case 400:// 登录失效
                    Toast(msg);
                    setTimeout(() => { // 重定向到登录页面，这里最好配合状态管理来保存当前页面的一个路由，登录完成再替换回去。
                        router.replace('/login')
                    }, 1500)
                    return Promise.reject(msg);
                default:
                    return Promise.reject(msg);
                    break;
            }

        } else {
            return Promise.reject(response.toString())
        }
    },
    // 服务器状态码不是200的情况
    error => {
        const {config} = error;
        if (config && config.submit) {
            clearRequestStatus(config.url);
        }
        if (error && error.response) {
            switch (error.response.status) {
                case 400:
                    error.message = '请求参数错误';
                    break;
                case 401:
                    error.message = '未授权，请登录';
                    break;
                case 403:
                    error.message = '跨域拒绝访问';
                    break;
                case 404:
                    error.message = `请求地址出错: ${error.response.config.url}`;
                    break;
                case 408:
                    error.message = '请求超时';
                    break;
                case 500:
                    error.message = '服务器内部错误';
                    break;
                case 501:
                    error.message = '服务未实现';
                    break;
                case 502:
                    error.message = '网关错误';
                    break;
                case 503:
                    error.message = '服务不可用';
                    break;
                case 504:
                    error.message = '网关超时';
                    break;
                case 505:
                    error.message = 'HTTP版本不受支持';
                    break;
                default:
                    break;
            }
        }
        if (error.message.search('timeout') > -1) {
            const {MaxReconnectionTimes, currentCount, timeStep} = service.defaults;


            // 可自行在这里配置showTitle弹出框展示
            Toast(`当前网络不佳...已尝试为您重连第${currentCount}次`)
            if (MaxReconnectionTimes <= currentCount) {
                return Promise.reject(error);
            }
            const Reconnection = new Promise((resolve, reject) => {
                setTimeout(() => {
                    service.defaults.currentCount++;
                    resolve();
                }, timeStep || 1000)
            })

            const {method, url, data} = config;
            return Reconnection.then(() => {
                service.defaults.loading = true;
                if (method == 'get') {
                    return get(url, data, true, true);
                }
                return post(url, data, true, true);
            });
        }

        return Promise.reject(error);
    }
);

/**
 * 清除当前请求的ajax
 * @param url
 */
function clearRequestStatus(url) {
    service.defaults.loading = false;
    const index = service.defaults.currentRequestList.indexOf(url);
    if (index > -1) {
        service.defaults.currentRequestList.splice(index, 1);
    }
}

/**
 * get
 * @param url
 * @param data
 * @param submit
 * @param loading
 * @returns {Promise<postcss.Result> | Q.Promise<any>}
 */
export function get(url, data, submit = false, loading = false) {
    return service({
        url,
        data: loading ? Qs.stringify(data) : data, // 注意这里后端如果不需要qs序列化可以去掉
        method: 'get',
        submit,
        loading
    }).catch(err => {
        service.defaults.currentCount = 0;
        console.log(err)
    })
}

/**
 * post
 * @param url
 * @param data
 * @param submit
 * @param loading
 * @returns {Promise<postcss.Result> | Q.Promise<any>}
 */
export function post(url, data, submit = false, loading = false) {
    return service({
        url,
        data: loading ? Qs.stringify(data) : data,// 注意这里后端如果不需要qs序列化可以去掉
        method: "post",
        submit,
        loading
    }).catch(err => {
        service.defaults.currentCount = 0;
        console.log(err)
    })
}


// For example

/***
 * 登录就是提交式请求，这里不能同时提交多次，所以第三个参数为true
 * @param username
 * @param password
 * @returns {Promise<postcss.Result>|Q.Promise<*>}
 */
export const login = (username, password) => post('/login', {username, password}, true);


/**
 * 获取首页列表数据时，tab进行切换，可以同时请求，拿到最后一次的数据
 * @param type
 * @returns {Promise<postcss.Result>|Q.Promise<*>}
 */
export const getList = (type) => get('/getList', {type});


/**
 * 直接将第二个参数封装成对象的化 get/post方法第二个参数就不需要带花括号
 * @param data
 * @returns {Promise<postcss.Result>|Q.Promise<*>}
 */
export const getDetail = (data) => post('/getDetail', data);
