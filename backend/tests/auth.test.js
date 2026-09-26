const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { request, app, db, resetDatabase, loginAs, DEMO_PASSWORD } = require('./helpers');

before(resetDatabase);
after(() => db.destroy());

describe('POST /api/auth/register', () => {
  it('creates a passenger account and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Karim', email: 'karim@example.com', password: 'karim12345' });

    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'PASSENGER');
    assert.equal(res.body.user.password_hash, undefined, 'password hash must never be returned');
  });

  it('ignores a "role" field, so nobody can sign up as a driver', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'sneaky1234', role: 'DRIVER' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'PASSENGER');
  });

  it('rejects an email that is already taken, even in different letter case', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nusrat Again', email: 'NUSRAT@teslapool.test', password: 'another123' });

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  it('lists every invalid field', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: '123' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['email', 'name', 'password']);
  });
});

describe('POST /api/auth/login', () => {
  it('logs Nusrat in with the demo password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nusrat@teslapool.test', password: DEMO_PASSWORD });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.name, 'Nusrat');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nusrat@teslapool.test', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@teslapool.test', password: 'wrong-password' });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(wrongPassword.body, unknownEmail.body);
  });
});

describe('GET /api/auth/me', () => {
  it("shows Jashim his profile with Bullet's seat capacity", async () => {
    const token = await loginAs('jashim');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'DRIVER');
    assert.equal(res.body.user.vehicle.name, 'Bullet');
    assert.equal(res.body.user.vehicle.capacity, 3);
  });

  it('rejects a request without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ sub: '1', role: 'DRIVER' }, 'not-our-secret');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
  });
});
