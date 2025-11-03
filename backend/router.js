// backend/router.js
const express = require('express');
const router = express.Router();
const api = require('./controllers/api');

// ---- REST API for cat1__nomenclature ----

// List + pagination + sorting + search
router.get('/api/cat1', api.list);

// Check code uniqueness
router.get('/api/cat1/exists', api.codeExists);

// Create new record
router.post('/api/cat1', api.createItem);

// Update existing record
router.put('/api/cat1/:uuid', api.updateItem);

// Soft delete and restore
router.delete('/api/cat1/:uuid', api.softDelete);
router.put('/api/cat1/:uuid/restore', api.restoreItem);

// ---- REST API for cat2__individuals ----
router.get('/api/individuals', api.individualsList);
router.post('/api/individuals', api.individualsCreate);
router.put('/api/individuals/:uuid', api.individualsUpdate);
router.delete('/api/individuals/:uuid', api.individualsSoftDelete);
router.put('/api/individuals/:uuid/restore', api.individualsRestore);
router.get('/api/individuals/exists/iin', api.iinExists);

// ---- REST API for cat3__staffers ----
router.get('/api/staffers', api.staffersList);
router.post('/api/staffers', api.staffersCreate);
router.put('/api/staffers/:uuid', api.staffersUpdate);
router.delete('/api/staffers/:uuid', api.staffersSoftDelete);
router.put('/api/staffers/:uuid/restore', api.staffersRestore);

module.exports = router;