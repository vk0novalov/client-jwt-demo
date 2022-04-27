import 'isomorphic-fetch';
import fetchMockModule from 'fetch-mock';
import test from 'ava';

import Api from "../src/index.js";

const BASE_URL = 'http://localhost';

test.beforeEach(t => {
  t.context.fetchMock = fetchMockModule.sandbox();
  t.context.api = new Api({ baseURL: BASE_URL, fetch: t.context.fetchMock });
});

test("Login captures token information", async t => {
  const { fetchMock, api } = t.context;
  const LOGIN_REQUEST = {
    login: "foo",
    password: "foo",
  };
  const LOGIN_RESPONSE = {
    token: "TOKEN",
    refreshToken: "REFRESH_TOKEN",
  };

  fetchMock.post(BASE_URL + "/auth/login", LOGIN_RESPONSE, 200);
  fetchMock.get(BASE_URL + "/users", [], 200);

  await api.login(LOGIN_REQUEST);
  await api.getUsers();

  t.is(fetchMock.calls().filter(call => call[1].method === 'GET').length, 1);
  t.is(
    fetchMock.calls()[1][1].headers.Authorization,
    `Bearer ${LOGIN_RESPONSE.token}`
  );
});

test("Logout removes token information", async t => {
  const { fetchMock, api } = t.context;
  const LOGIN_REQUEST = {
    login: "foo",
    password: "foo",
  };
  const LOGIN_RESPONSE = {
    token: "TOKEN",
    refreshToken: "REFRESH_TOKEN",
  };

  fetchMock.post(BASE_URL + "/auth/login", LOGIN_RESPONSE, 200);
  fetchMock.get(BASE_URL + "/users", 401);

  await api.login(LOGIN_REQUEST);
  await api.logout();

  await t.throwsAsync(async () => {
    await api.getUsers();
  });

  t.is(fetchMock.calls().filter(call => call[1].method === 'GET').length, 1);
  t.falsy(fetchMock.calls()[1][1].headers.Authorization);
});

test("Correctly retries request when got 401 with new token", async t => {
  const { fetchMock, api } = t.context;
  const LOGIN_REQUEST = {
    login: "foo",
    password: "foo",
  };
  const LOGIN_RESPONSE = {
    token: "TOKEN",
    refreshToken: "REFRESH_TOKEN",
  };

  const REFRESH_REQUEST = {
    refreshToken: LOGIN_RESPONSE.refreshToken,
  };
  const REFRESH_RESPONSE = {
    token: "TOKEN2",
    refreshToken: "REFRESH_TOKEN2",
  };

  fetchMock.post(BASE_URL + "/auth/login", LOGIN_RESPONSE, 200);
  fetchMock.once({
    url: BASE_URL + "/auth/refresh",
    method: 'POST',
    body: REFRESH_REQUEST,
  }, REFRESH_RESPONSE, 200);

  fetchMock.mock({
    url: BASE_URL + "/users",
    method: 'GET'
  }, ((_, opts) => {
    const { Authorization: auth } = opts.headers;
    if (auth === `Bearer ${LOGIN_RESPONSE.token}`) {
      return 401;
    }
    if (auth === `Bearer ${REFRESH_RESPONSE.token}`) {
      return {
        status: 200,
        body: []
      }
    }
    return 404;
  }), 200);

  await api.login(LOGIN_REQUEST);
  await api.getUsers();

  t.is(fetchMock.calls().filter(call => call[1].method === 'GET').length, 2);
  t.is(
    fetchMock.calls()[3][1].headers.Authorization,
    `Bearer ${REFRESH_RESPONSE.token}`
  );
});

test("Correctly fails request when got non-401 error", async t => {
  const { fetchMock, api } = t.context;
  fetchMock.get(BASE_URL + "/users", 404);
  await t.throwsAsync(async () => {
    await api.getUsers();
  });
});

test("Does not consumes token more than once", async t => {
  const { fetchMock, api } = t.context;
  const LOGIN_REQUEST = {
    login: "foo",
    password: "foo",
  };
  const LOGIN_RESPONSE = {
    token: "TOKEN",
    refreshToken: "REFRESH_TOKEN",
  };

  const REFRESH_REQUEST = {
    refreshToken: LOGIN_RESPONSE.refreshToken,
  };
  const REFRESH_RESPONSE = {
    token: "TOKEN2",
    refreshToken: "REFRESH_TOKEN2",
  };

  fetchMock.post(BASE_URL + "/auth/login", LOGIN_RESPONSE, 200);
  fetchMock.once({
    url: BASE_URL + "/auth/refresh",
    method: 'POST',
    body: REFRESH_REQUEST,
  }, REFRESH_RESPONSE, 200);

  fetchMock.mock({
    url: BASE_URL + "/users",
    method: 'GET'
  }, (_, opts) => {
    const { Authorization: auth } = opts.headers;
    if (auth === `Bearer ${LOGIN_RESPONSE.token}`) {
      return 401;
    }
    if (auth === `Bearer ${REFRESH_RESPONSE.token}`) {
      return {
        status: 200,
        body: []
      }
    }
    return 404;
  });

  await api.login(LOGIN_REQUEST);
  await Promise.all([api.getUsers(), api.getUsers()]);

  t.is(fetchMock.calls().filter(call => call[0].includes('/auth/refresh')).length, 1);
});

test("Can correctly handle second refresh", async t => {
  t.timeout(2000);

  const { fetchMock, api } = t.context;
  const LOGIN_REQUEST = {
    login: "foo",
    password: "foo",
  };
  const LOGIN_RESPONSE = {
    token: "TOKEN",
    refreshToken: "REFRESH_TOKEN",
  };

  const REFRESH_REQUEST = {
    refreshToken: LOGIN_RESPONSE.refreshToken,
  };
  const REFRESH_RESPONSE = {
    token: "TOKEN2",
    refreshToken: "REFRESH_TOKEN2",
  };

  const REFRESH_REQUEST2 = {
    refreshToken: REFRESH_RESPONSE.refreshToken,
  };
  const REFRESH_RESPONSE2 = {
    token: "TOKEN3",
    refreshToken: "REFRESH_TOKEN3",
  };

  fetchMock.post(BASE_URL + "/auth/login", LOGIN_RESPONSE, 200);
  fetchMock.mock({
    url: BASE_URL + "/auth/refresh",
    method: 'POST'
  }, (_, opts) => {
    if (opts.body === JSON.stringify(REFRESH_REQUEST)) {
      return {
        status: 200,
        body: REFRESH_RESPONSE
      };
    }
    if (opts.body === JSON.stringify(REFRESH_REQUEST2)) {
      return {
        status: 200,
        body: REFRESH_RESPONSE2
      };
    }
    return 401;
  });

  fetchMock.mock({
    url: BASE_URL + "/users",
    method: 'GET'
  }, (_, opts) => {
    const { Authorization: auth } = opts.headers;
    if (auth === `Bearer ${LOGIN_RESPONSE.token}` || auth === `Bearer ${REFRESH_RESPONSE.token}`) {
      return 401;
    }
    if (auth === `Bearer ${REFRESH_RESPONSE.token}` || auth === `Bearer ${REFRESH_RESPONSE2.token}`) {
      return {
        status: 200,
        body: []
      }
    }
    return 404;
  }, 200);

  await api.login(LOGIN_REQUEST);
  await Promise.all([api.getUsers(), api.getUsers(), api.getUsers()]);

  t.is(fetchMock.calls().filter(call => call[0].includes('/auth/refresh')).length, 2);
});
