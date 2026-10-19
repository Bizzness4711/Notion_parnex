import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext } from '../test-helpers/app-context.mjs';

// security.js localStorage'a dokunur; vm sandbox'ındaki localStorage stub'ı
// üzerinden test edilir. currentUser yokken securityStorageKey null döner ve
// localStorage.getItem('') çağrılmamalı (bu, boş anahtarla başka bir alandan
// veri sızıntısı riski taşır).
const SCRIPTS = ['js/utils.js', 'js/firebase-config.js', 'js/security.js'];

function makeHarness() {
    return loadAppScripts(SCRIPTS);
}

function spyOnGetItem(context) {
    const storage = context.localStorage;
    const original = storage.getItem;
    const calls = [];
    storage.getItem = (...args) => {
        calls.push(args[0]);
        return original(...args);
    };
    return calls;
}

test('getSecurityPinAttempts: currentUser yokken getItem("") çağrılmaz, 0 döner', () => {
    const context = makeHarness();
    const getCalls = spyOnGetItem(context);
    evalInContext(context, 'currentUser = null;');
    const result = evalInContext(context, 'getSecurityPinAttempts()');
    assert.equal(result, 0);
    assert.deepEqual(getCalls, [], 'getItem hiç çağrılmamalı');
});

test('getSecurityPinAttempts: currentUser undefined ile de null ile aynı davranır', () => {
    const context = makeHarness();
    const getCalls = spyOnGetItem(context);
    evalInContext(context, 'currentUser = undefined;');
    const result = evalInContext(context, 'getSecurityPinAttempts()');
    assert.equal(result, 0);
    assert.deepEqual(getCalls, [], 'getItem hiç çağrılmamalı');
});

test('getSecurityPinAttempts: geçerli anahtarla kayıtlı deneme sayısını okur', () => {
    const context = makeHarness();
    evalInContext(context, "currentUser = { uid: 'user-1' };");
    evalInContext(context, "localStorage.setItem(securityStorageKey('pin-attempts'), '3');");
    const result = evalInContext(context, 'getSecurityPinAttempts()');
    assert.equal(result, 3);
});

test('getSecurityPinAttempts: kayıtlı değer yokken 0 döner (geçerli anahtar)', () => {
    const context = makeHarness();
    evalInContext(context, "currentUser = { uid: 'user-1' };");
    const result = evalInContext(context, 'getSecurityPinAttempts()');
    assert.equal(result, 0);
});

test('getSecurityPinLockoutUntil: currentUser yokken getItem("") çağrılmaz, 0 döner', () => {
    const context = makeHarness();
    const getCalls = spyOnGetItem(context);
    evalInContext(context, 'currentUser = null;');
    const result = evalInContext(context, 'getSecurityPinLockoutUntil()');
    assert.equal(result, 0);
    assert.deepEqual(getCalls, [], 'getItem hiç çağrılmamalı');
});

test('getSecurityPinLockoutUntil: geçerli anahtarla kilitlenme zamanını okur', () => {
    const context = makeHarness();
    evalInContext(context, "currentUser = { uid: 'user-1' };");
    evalInContext(context, "localStorage.setItem(securityStorageKey('pin-lockout-until'), '1700000000000');");
    const result = evalInContext(context, 'getSecurityPinLockoutUntil()');
    assert.equal(result, 1700000000000);
});

test('getSecurityTimeoutMinutes: currentUser yokken getItem("") çağrılmaz, 0 döner', () => {
    const context = makeHarness();
    const getCalls = spyOnGetItem(context);
    evalInContext(context, 'currentUser = null;');
    const result = evalInContext(context, 'getSecurityTimeoutMinutes()');
    assert.equal(result, 0);
    assert.deepEqual(getCalls, [], 'getItem hiç çağrılmamalı');
});

test('getSecurityTimeoutMinutes: gecerli anahtarla dakikayi okur, gecersiz degeri 0a dusurur', () => {
    const context = makeHarness();
    evalInContext(context, "currentUser = { uid: 'user-1' };");
    evalInContext(context, "localStorage.setItem(securityStorageKey('timeout'), '5');");
    assert.equal(evalInContext(context, 'getSecurityTimeoutMinutes()'), 5);
    evalInContext(context, "localStorage.setItem(securityStorageKey('timeout'), '0');");
    assert.equal(evalInContext(context, 'getSecurityTimeoutMinutes()'), 0);
    evalInContext(context, "localStorage.setItem(securityStorageKey('timeout'), 'abc');");
    assert.equal(evalInContext(context, 'getSecurityTimeoutMinutes()'), 0);
});
