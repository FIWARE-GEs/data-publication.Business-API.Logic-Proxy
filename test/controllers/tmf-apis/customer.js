var nock = require('nock'),
    proxyquire =  require('proxyquire'),
    testUtils = require('../../utils');

describe('Customer API', function() {

    var config = testUtils.getDefaultConfig();
    var BILLING_SERVER = (config.appSsl ? 'https' : 'http') + '://' + config.appHost + ':' + config.endpoints.billing.port;
    var CUSTOMER_SERVER = (config.appSsl ? 'https' : 'http') + '://' + config.appHost + ':' + config.endpoints.customer.port;

    var BASE_BILLING_PATH = '/' + config.endpoints.billing.path + '/api/billingManagement/v2/billingAccount';
    var VALID_CUSTOMER_PATH = '/' + config.endpoints.customer.path + '/api/customerManagement/v2/customer';
    var VALID_CUSTOMER_ACCOUNT_PATH = '/' + config.endpoints.customer.path + '/api/customerManagement/v2/customerAccount';

    var CUSTOMER_CANNOT_BE_RETRIEVED_ERROR = {
        status: 500,
        message: 'The attached customer cannot be retrieved'
    };

    var UNAUTHORIZED_UPDATE_RESOURCE_ERROR = {
            status: 403,
            message: 'Unauthorized to update/delete non-owned resources'
    };

    var getCustomerAPI = function(utils, tmfUtils) {
        return proxyquire('../../../controllers/tmf-apis/customer', {
            './../../config': config,
            './../../lib/tmfUtils': tmfUtils,
            './../../lib/utils': utils
        }).customer;
    };

    beforeEach(function() {
        nock.cleanAll();
    });

    describe('Check Permissions', function() {

        // Generic test for GET, POST, PATCH, DELETE

        var failIfNotLoggedIn = function (method, done) {

            var returnedError = {
                status: 401,
                message: 'User not logged in'
            };

            var utils = jasmine.createSpyObj('utils', ['validateLoggedIn']);
            utils.validateLoggedIn.and.callFake(function (req, callback) {
                callback(returnedError);
            });

            var customerApi = getCustomerAPI(utils, {});
            var req = {
                method: method,
                apiUrl: VALID_CUSTOMER_PATH,
                body: {}
            };

            customerApi.checkPermissions(req, function (err) {
                expect(err).toBe(returnedError);
                done();
            });
        };

        describe('General', function () {

            it('should reject requests to not supported paths', function (done) {

                var customerApi = getCustomerAPI({}, {});
                var req = {
                    method: 'GET',
                    apiUrl: '/' + config.endpoints.customer.path + '/api/customerManagement/v2/hub'
                };

                customerApi.checkPermissions(req, function (err) {

                    expect(err).toEqual({
                        status: 403,
                        message: 'This API feature is not supported yet'
                    });

                    done();
                });
            });

            it('should reject requests with unrecognized methods', function (done) {
                var customerApi = getCustomerAPI({}, {});
                var req = {
                    method: 'PUT',
                    apiUrl: VALID_CUSTOMER_PATH
                };

                customerApi.checkPermissions(req, function (err) {

                    expect(err).toEqual({
                        status: 405,
                        message: 'Method not allowed'
                    });

                    done();
                });
            });

            it('should reject requests with invalid body', function (done) {
                var customerApi = getCustomerAPI({}, {});
                var req = {
                    method: 'POST',
                    apiUrl: VALID_CUSTOMER_PATH,
                    body: 'invalid'
                };

                customerApi.checkPermissions(req, function (err) {

                    expect(err).toEqual({
                        status: 400,
                        message: 'Invalid body'
                    });

                    done();
                });
            });
        });

        describe('GET', function () {

            it('should fail if user is not logged in', function (done) {
                failIfNotLoggedIn('GET', done);
            });

            var testListCustomerAccount = function (path, done) {

                var utils = jasmine.createSpyObj('utils', ['validateLoggedIn']);
                utils.validateLoggedIn.and.callFake(function (req, callback) {
                    callback(null);
                });

                var customerApi = getCustomerAPI(utils, {});
                var req = {
                    method: 'GET',
                    apiUrl: path,
                    body: {}
                };

                customerApi.checkPermissions(req, function (err) {
                    expect(err).toEqual({
                        status: 403,
                        message: 'Unauthorized to retrieve the list of customer accounts'
                    });
                    done();
                });
            };

            it('should fail if listing customer accounts', function (done) {
                testListCustomerAccount(VALID_CUSTOMER_ACCOUNT_PATH, done);
            });

            it('should fail if listing customer accounts even if query included', function (done) {
                testListCustomerAccount(VALID_CUSTOMER_ACCOUNT_PATH + '/?a=b', done);
            });

            var testListCustomer = function (expectedErr, done) {

                var utils = jasmine.createSpyObj('utils', ['validateLoggedIn']);
                utils.validateLoggedIn.and.callFake(function (req, callback) {
                    callback(null);
                });

                var tmfUtils = jasmine.createSpyObj('tmfUtils', ['filterRelatedPartyFields']);
                tmfUtils.filterRelatedPartyFields.and.callFake(function (req, callback) {
                    callback(expectedErr);
                });

                var customerApi = getCustomerAPI(utils, tmfUtils);
                var req = {
                    method: 'GET',
                    apiUrl: VALID_CUSTOMER_PATH,
                    body: {}
                };

                customerApi.checkPermissions(req, function (err) {
                    expect(err).toBe(expectedErr);
                    done();
                });
            };

            it('should fail if listing customer with invalid filter', function (done) {
                testListCustomer({status: 403, message: 'Invalid filter'}, done);
            });

            it('should not fail if listing customer with valid filter', function (done) {
                testListCustomer(null, done);
            });

            var testGetResource = function (path, done) {

                var utils = jasmine.createSpyObj('utils', ['validateLoggedIn']);
                utils.validateLoggedIn.and.callFake(function (req, callback) {
                    callback(null);
                });

                var customerApi = getCustomerAPI(utils, {});
                var req = {
                    method: 'GET',
                    apiUrl: path,
                    body: {}
                };

                customerApi.checkPermissions(req, function (err) {
                    expect(err).toBe(null);
                    done();
                });
            };

            it('should allow to retrieve one customer', function (done) {
                testGetResource(VALID_CUSTOMER_PATH + '/1', done);
            });

            it('should allow to retrieve one customer account', function (done) {
                testGetResource(VALID_CUSTOMER_ACCOUNT_PATH + '/1', done);
            });

        });

        describe('POST', function () {

            it('should fail if the user is not logged in', function (done) {
                failIfNotLoggedIn('POST', done);
            });

            var testCreate = function (path, body, hasPartyRole, expectedPartyCall, expectedErr, done) {

                var utils = jasmine.createSpyObj('utils', ['validateLoggedIn']);
                utils.validateLoggedIn.and.callFake(function (req, callback) {
                    callback(null);
                });

                var tmfUtils = jasmine.createSpyObj('tmfUtils', ['hasPartyRole']);
                tmfUtils.hasPartyRole.and.returnValue(hasPartyRole);

                var customerApi = getCustomerAPI(utils, tmfUtils);
                var req = {
                    method: 'POST',
                    apiUrl: path,
                    body: JSON.stringify(body)
                };

                customerApi.checkPermissions(req, function (err) {

                    expect(err).toEqual(expectedErr);

                    if (expectedPartyCall) {
                        expect(tmfUtils.hasPartyRole).toHaveBeenCalledWith(req, expectedPartyCall, 'owner');
                    }

                    done();
                });

            };

            it('should fail when creating customer without related party', function (done) {

                var expectedErr = {
                    status: 422,
                    message: 'Unable to create customer without specifying the related party'
                };

                testCreate(VALID_CUSTOMER_PATH, {}, false, null, expectedErr, done);

            });

            it('should fail when creating a customer with invalid related party', function (done) {

                var expectedErr = {
                    status: 403,
                    message: 'Related Party does not match with the user making the request'
                };

                var body = {
                    relatedParty: {
                        id: 7
                    }
                };

                testCreate(VALID_CUSTOMER_PATH, body, false, [body.relatedParty], expectedErr, done);
            });

            it('should allow to create customer with valid related party', function (done) {

                var body = {
                    relatedParty: {
                        id: 7
                    }
                };

                testCreate(VALID_CUSTOMER_PATH, body, true, [body.relatedParty], null, done);
            });

            it('should fail when creating customer with customerAccount', function (done) {

                var expectedErr = {
                    status: 403,
                    message: 'Customer Account cannot be manually modified'
                };

                var body = {
                    relatedParty: {
                        id: 7
                    },
                    customerAccount: []
                };

                testCreate(VALID_CUSTOMER_PATH, body, true, [body.relatedParty], expectedErr, done);
            });

            it('should fail when creating customer account without customer', function (done) {

                var expectedErr = {
                    status: 422,
                    message: 'Customer Accounts must be associated to a Customer'
                };

                testCreate(VALID_CUSTOMER_ACCOUNT_PATH, {}, false, null, expectedErr, done);
            });

            it('should fail when creating a customer account with invalid customer', function (done) {

                var body = {
                    customer: {
                        id: 7,
                        href: CUSTOMER_SERVER + VALID_CUSTOMER_PATH + '/8'
                    }
                };

                var expectedErr = {
                    status: 422,
                    message: 'Customer ID and Customer HREF mismatch'
                };

                testCreate(VALID_CUSTOMER_ACCOUNT_PATH, body, false, null, expectedErr, done);
            });

            it('should fail when creating a customer account and customer cannot be retrieved', function (done) {

                var customerPath = VALID_CUSTOMER_PATH + '/8';

                var body = {
                    customer: {
                        id: 8,
                        href: CUSTOMER_SERVER + customerPath
                    }
                };

                nock(CUSTOMER_SERVER)
                    .get(customerPath)
                    .reply(500);

                testCreate(VALID_CUSTOMER_ACCOUNT_PATH, body, false, null, CUSTOMER_CANNOT_BE_RETRIEVED_ERROR, done);

            });

            var testCreateAccountExistingCustomer = function (hasPartyRole, expectedErr, done) {

                var customerPath = VALID_CUSTOMER_PATH + '/8';

                var body = {
                    customer: {
                        id: 8,
                        href: CUSTOMER_SERVER + customerPath
                    }
                };

                var customer = {
                    relatedParty: {
                        id: 9
                    }
                };

                nock(CUSTOMER_SERVER)
                    .get(customerPath)
                    .reply(200, customer);

                testCreate(VALID_CUSTOMER_ACCOUNT_PATH, body, hasPartyRole, [customer.relatedParty], expectedErr, done);
            };

            it('should fail when creating a customer account and customer does not belong to the user', function (done) {

                var expectedErr = {
                    status: 403,
                    message: 'The given Customer does not belong to the user making the request'
                };

                testCreateAccountExistingCustomer(false, expectedErr, done);

            });

            it('should allow to create customer account', function (done) {
                testCreateAccountExistingCustomer(true, null, done);
            });

        });

        var testUpdateDelete = function (path, method, body, hasPartyRole, expectedPartyCall, expectedErr, done) {

            var utils = jasmine.createSpyObj('utils', ['validateLoggedIn']);
            utils.validateLoggedIn.and.callFake(function (req, callback) {
                callback(null);
            });

            var tmfUtils = jasmine.createSpyObj('tmfUtils', ['hasPartyRole']);
            tmfUtils.hasPartyRole.and.returnValue(hasPartyRole);

            var customerApi = getCustomerAPI(utils, tmfUtils);
            var req = {
                method: method,
                apiUrl: path,
                body: JSON.stringify(body)
            };

            customerApi.checkPermissions(req, function (err) {
                expect(err).toEqual(expectedErr);

                if (expectedPartyCall) {
                    expect(tmfUtils.hasPartyRole).toHaveBeenCalledWith(req, expectedPartyCall, 'owner');
                }

                done();
            });
        };

        // GENERIC TESTS FOR PATCH & DELETE

        var failUpdateResourceCannotBeRetrieved = function(method, done) {

            // This test is valid for customer and customer accounts
            var customerPath = VALID_CUSTOMER_PATH + '/8';

            nock(CUSTOMER_SERVER)
                .get(customerPath)
                .reply(500);

            var expectedErr = {
                status: 500,
                message: 'The required resource cannot be retrieved'
            };

            testUpdateDelete(customerPath, method, {}, false, null, expectedErr, done);
        };

        var failUpdateResourceDoesNotExist = function(method, done) {
            // This test is valid for customer and customer accounts
            var customerPath = VALID_CUSTOMER_PATH + '/8';

            nock(CUSTOMER_SERVER)
                .get(customerPath)
                .reply(404);

            var expectedErr = {
                status: 404,
                message: 'The required resource does not exist'
            };

            testUpdateDelete(customerPath, method, {}, false, null, expectedErr, done);
        };

        var failUpdateNonOwnedResource = function(method, done) {
            testUpdateDeleteCustomer('PATCH', {}, false, UNAUTHORIZED_UPDATE_RESOURCE_ERROR, done);
        };

        var testUpdateDeleteCustomer = function (method, body, hasPartyRole, expectedErr, done) {

            var customerPath = VALID_CUSTOMER_PATH + '/8';

            var customer = {
                relatedParty: {
                    id: 9
                }
            };

            nock(CUSTOMER_SERVER)
                .get(customerPath)
                .reply(200, customer);

            testUpdateDelete(customerPath, method, body, hasPartyRole, [customer.relatedParty], expectedErr, done);
        };

        var failUpdateCustomerAccountCustomerInaccessible = function(method, done) {

            var customerAccountPath = VALID_CUSTOMER_ACCOUNT_PATH + '/9';
            var customerPath = VALID_CUSTOMER_PATH + '/8';

            var customerAccount = {
                customer: {
                    id: 8,
                    href: CUSTOMER_SERVER + customerPath
                }
            };

            nock(CUSTOMER_SERVER)
                .get(customerAccountPath)
                .reply(200, customerAccount);

            nock(CUSTOMER_SERVER)
                .get(customerPath)
                .reply(500);

            testUpdateDelete(customerAccountPath, method, {}, false, null, CUSTOMER_CANNOT_BE_RETRIEVED_ERROR, done);
        };

        var testUpdateCustomerAccountExistingCustomer = function (method, body, hasPartyRole, expectedErr, done) {

            var customerAccountPath = VALID_CUSTOMER_ACCOUNT_PATH + '/9';
            var customerPath = VALID_CUSTOMER_PATH + '/8';

            var customerAccount = {
                customer: {
                    id: 8,
                    href: CUSTOMER_SERVER + customerPath
                }
            };

            var customer = {
                relatedParty: {
                    id: 9
                }
            };

            nock(CUSTOMER_SERVER)
                .get(customerAccountPath)
                .reply(200, customerAccount);

            nock(CUSTOMER_SERVER)
                .get(customerPath)
                .reply(200, customer);

            testUpdateDelete(customerAccountPath, method, body, hasPartyRole, [customer.relatedParty], expectedErr, done);
        };

        var failUpdateCustomerAccountNotBelonginToUser = function(method, done) {
            testUpdateCustomerAccountExistingCustomer(method, {}, false, UNAUTHORIZED_UPDATE_RESOURCE_ERROR, done);
        };

        describe('PATCH', function () {

            it('should fail if the user is not logged in', function (done) {
                failIfNotLoggedIn('PATCH', done);
            });

            it('should fail when updating a customer (account)? and it cannot be retrieved', function (done) {
                failUpdateResourceCannotBeRetrieved('PATCH', done)
            });

            it('should fail when updating a customer (account)? that does not exist', function (done) {
                failUpdateResourceDoesNotExist('PATCH', done);
            });

            it('should fail when updating a non-owned customer', function (done) {
                failUpdateNonOwnedResource('PATCH', done);
            });

            it('should fail to update a customer when related party included', function (done) {
                var expectedErr = {
                    status: 403,
                    message: 'Related Party cannot be modified'
                };

                testUpdateDeleteCustomer('PATCH', {relatedParty: {}}, true, expectedErr, done);
            });

            it('should allow to update a customer', function (done) {
                testUpdateDeleteCustomer('PATCH', {}, true, null, done);
            });

            it('should fail when updating a customer account and the attached customer cannot be retrieved', function (done) {
                failUpdateCustomerAccountCustomerInaccessible('PATCH', done);
            });

            it('should fail when updating a customer account and the attached customer does not belong to the user', function (done) {
                failUpdateCustomerAccountNotBelonginToUser('PATCH', done);
            });

            it('should allow to update a customer account', function (done) {
                testUpdateCustomerAccountExistingCustomer('PATCH', {}, true, null, done);
            });

            it('should fail when updating a customer account and customer included', function (done) {

                var expectedErr = {
                    status: 403,
                    message: 'Customer cannot be modified'
                };

                testUpdateCustomerAccountExistingCustomer('PATCH', {customer: {}}, true, expectedErr, done);
            });

        });

        describe('DELETE', function () {

            it('should fail if the user is not logged in', function (done) {
                failIfNotLoggedIn('DELETE', done);
            });

            it('should fail when updating a customer (account)? and it cannot be retrieved', function (done) {
                failUpdateResourceCannotBeRetrieved('DELETE', done)
            });

            it('should fail when updating a customer (account)? that does not exist', function (done) {
                failUpdateResourceDoesNotExist('DELETE', done);
            });

            it('should fail when updating a non-owned customer', function (done) {
                failUpdateNonOwnedResource('DELETE', done);
            });

            it('should allow to update a customer', function (done) {
                testUpdateDeleteCustomer('DELETE', {}, true, null, done);
            });

            it('should fail when updating a customer account and the attached customer cannot be retrieved', function (done) {
                failUpdateCustomerAccountCustomerInaccessible('DELETE', done);
            });

            it('should fail when updating a customer account and the attached customer does not belong to the user', function (done) {
                failUpdateCustomerAccountNotBelonginToUser('PATCH', done);
            });

            it('should allow to update a customer account', function (done) {
                testUpdateCustomerAccountExistingCustomer('DELETE', {}, true, null, done);
            });

        });
    });

    describe('Post Validation', function() {

        it('should allow to retrieve collections', function(done) {

            var req = {
                method: 'GET',
                body: JSON.stringify([])
            };

            var customerApi = getCustomerAPI({}, {});

            customerApi.executePostValidation(req, function(err) {
                expect(err).toBe(null);
                done();
            });
        });

        var allowToRetrieveOwnerResource = function(body, hasPartyRole, isRelatedPartyValues, hasPartyRoleArgument,
                                                    isRelatedPartyArguments, expectedErr, done) {

            var req = {
                method: 'GET',
                body: JSON.stringify(body)
            };

            var tmfUtils = jasmine.createSpyObj('tmfUtils', ['hasPartyRole', 'isRelatedParty']);
            tmfUtils.hasPartyRole.and.returnValue(hasPartyRole);
            tmfUtils.isRelatedParty.and.returnValues.apply(tmfUtils.isRelatedParty, isRelatedPartyValues)

            var customerApi = getCustomerAPI({}, tmfUtils);

            customerApi.executePostValidation(req, function(err) {
                expect(err).toEqual(expectedErr);

                expect(tmfUtils.hasPartyRole).toHaveBeenCalledWith(req, hasPartyRoleArgument, 'owner');

                isRelatedPartyArguments.forEach(function(item) {
                    expect(tmfUtils.isRelatedParty).toHaveBeenCalledWith(req, item);
                });

                done();
            });
        };

        it('should allow to retrieve an owned customer', function(done) {

            var body = {
                relatedParty: {
                    id: 9
                }
            };

            allowToRetrieveOwnerResource(body, true, null, [body.relatedParty], [], null, done);
        });

        it('should allow to retrieve an owner customer account', function(done) {

            // isOwner function has been tested previously

            var customerPath = '/customer/1';

            var customerAccount = {
                customer: {
                    href: CUSTOMER_SERVER + customerPath
                }
            };

            var customer = {
                relatedParty: {
                    id: 3
                }
            };

            nock(CUSTOMER_SERVER)
                .get(customerPath)
                .reply(200, customer);

            allowToRetrieveOwnerResource(customerAccount, true, null, [customer.relatedParty], [], null, done);
        });

        var testBillingAccountRetrieved = function(response, isRelatedPartyValues, isRelatedPartyArguments, expectedErr, done) {
            var customer = {
                relatedParty: {
                    id: 9
                },
                customerAccount: [
                    {
                        id: 1
                    },
                    {
                        id: 2
                    }
                ]
            };

            nock(BILLING_SERVER)
                .get(BASE_BILLING_PATH + '?customerAccount.id=1,2')
                .reply(response.status, response.body);

            allowToRetrieveOwnerResource(customer, false, isRelatedPartyValues,
                [customer.relatedParty], isRelatedPartyArguments, expectedErr, done);
        };

        it('should fail if customer account does not belong to the user and billing account cannot be retrieved', function(done) {

            nock(BILLING_SERVER)
                .get(BASE_BILLING_PATH + '?customerAccount.id=1,2')
                .reply(500);

            var expectedErr = {
                status: 500,
                message: 'An error arises at the time of retrieving associated billing accounts'
            };

            testBillingAccountRetrieved({status: 500, body: null}, null, [], expectedErr, done);

        });

        it('should fail if customer account does not belong to the user and user is not included in billing account', function(done) {

            var billingAccount = {
                relatedParty: [
                    {
                        id: 5
                    }
                ]
            };

            var expectedErr = {
                status: 403,
                message: 'Unauthorized to retrieve the information of the given customer'
            };

            testBillingAccountRetrieved({status: 200, body: [billingAccount]}, [false],
                [billingAccount.relatedParty], expectedErr, done);

        });

        it('should allow to retrieve customer if user is included in billing account', function(done) {

            var billingAccount1 = {
                relatedParty: [
                    {
                        id: 5
                    }
                ]
            };

            var billingAccount2 = {
                relatedParty: [
                    {
                        id: 9
                    }
                ]
            };

            testBillingAccountRetrieved({status: 200, body: [billingAccount1, billingAccount2]}, [false, true],
                [billingAccount1.relatedParty, billingAccount2.relatedParty], null, done);

        });

    });

});