import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authErrorMessage} from '../site/oauth-errors.js';
test('login credential failure is distinct from an expired authorization',()=>{
 assert.match(authErrorMessage('/token?grant_type=password',400,'invalid_credentials'),/邮箱或密码不匹配/);
 assert.match(authErrorMessage('/oauth/authorizations/opaque-id',404,'flow_state_not_found'),/授权请求已过期/);
 assert.match(authErrorMessage('/token',429,''),/尝试过多/);
 assert(!authErrorMessage('/token',400,'untrusted-secret-message').includes('untrusted-secret-message'));
});

