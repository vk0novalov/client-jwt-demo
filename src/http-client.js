import 'isomorphic-fetch';

const getDefaultHeaders = () => ({
  'Content-type': 'application/json'
});

export default class HttpClient {

  #requestInterceptors = [];
  #responseInterceptors = [];

  constructor(baseURL, fetch) {
    this.baseURL = baseURL;
    this.fetch = fetch;
  }

  useRequestInterceptor(interceptor) {
    this.#requestInterceptors.push(interceptor);
  }

  useResponseInterceptor(interceptor) {
    this.#responseInterceptors.push(interceptor);
  }

  #prepareRequest(config) {
    return this.#requestInterceptors.reduce(
      (config, interceptor) => ({ ...config, ...(interceptor(config) || {})}), config
    );
  }

  async #handleError(err, config) {
    for (const interceptor of this.#responseInterceptors) {
      await interceptor(err, config);
    }
  }

  async request(config, forceRequestInterceptors = false) {
    return await this.fetch(config.url, forceRequestInterceptors ? this.#prepareRequest(config) : config)
      .then(async r => {
        if ((r.status / 100 | 0) !== 2) {
          return this.#handleError(r, config);
        }
        return r.json();
       })
      .catch(async err => {
        await this.#handleError(err, config);
      });
  }

  async get(url) {
    const config = this.#prepareRequest({
      url: this.baseURL + url,
      method: 'GET',
      headers: getDefaultHeaders(),
    });
    return await this.request(config);
  }

  async post(url, body) {
    const config = this.#prepareRequest({
      url: this.baseURL + url,
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify(body),
    });
    return await this.request(config);
  }

}