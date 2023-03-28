import HttpClient from './http-client.js';

export default class Api {
  constructor(options = {}) {
    this.client = new HttpClient(options.baseURL, options.fetch || globalThis.fetch);
    this.token = options.token;
    this.refreshToken = options.refreshToken;
    this.refreshRequest = null;
    this.isRetrying = false;

    this.client.useRequestInterceptor((config) => {
      if (!this.token) {
        return config;
      }

      const newConfig = {
        headers: {},
        ...config,
      };

      newConfig.headers.Authorization = `Bearer ${this.token}`;
      return newConfig;
    });

    this.client.useResponseInterceptor(async (error, config) => {
      if (
        !this.refreshToken ||
        error.status !== 401 ||
        config.retry
      ) {
        throw new Error(error);
      }

      if (!this.refreshRequest) {
        this.isRetrying = true;
        this.refreshRequest = this.client.post("/auth/refresh", {
          refreshToken: this.refreshToken,
        })
          .then(data => {
            this.isRetrying = false;
            return data;
          })
          .finally(() => { this.refreshRequest = null; });
      }
      const data = await this.refreshRequest;
      this.token = data.token;
      this.refreshToken = data.refreshToken;
      const newRequest = {
        ...config,
        retry: this.isRetrying,
      };

      return this.client.request(newRequest);
    });
  }

  async login({ login, password }) {
    const data = await this.client.post('/auth/login', { login, password });
    this.token = data.token;
    this.refreshToken = data.refreshToken;
  }

  async logout() {
    this.token = null;
    this.refreshToken = null;
  }

  async getUsers() {
    return await this.client.get("/users");
  }

}
