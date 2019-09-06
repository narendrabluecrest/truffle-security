const assert = require('assert');
const proxyquire = require('proxyquire');
const rewire = require('rewire');
const fs = require('fs');
const path = require('path');
const armlet = require('armlet');
const sinon = require('sinon');
const trufstuf = require('../lib/trufstuf');
const mythx = require('../lib/mythx');
const rewiredHelpers = rewire('../helpersRefactor');
const util = require('util');
const yaml = require('js-yaml');


async function assertThrowsAsync(fn, message) {
    let f = () => {};
    try {
        await fn();
    } catch(e) {
        f = () => { throw e; };
    } finally {
        assert.throws(f, message);
    }
}

describe('helpers.js', function() {
    let helpers;

    function compareTest(line1, col1, line2, col2, expect) {
        const res = helpers.compareLineCol(line1, col1, line2, col2);
        if (expect === '=') {
            assert.ok(res === 0);
        } else if (expect === '<') {
            assert.ok(res < 0);
        } else if (expect === '>') {
            assert.ok(res > 0);
        } else {
            assert.throws(`invalid test expect symbol ${expect}; '=', '<', or '>' expected`);
        }
    }

    describe('test helper functions', () => {
        let stubLog;

        beforeEach(function () {
            helpers = proxyquire('../helpersRefactor', {});
            stubLog = sinon.spy(console, 'log');
        });

        afterEach(function () {
          stubLog.restore();
        });



        it('should call printVersion', async () => {
            const stubAPI = sinon.stub(armlet, 'ApiVersion').returns({ 'api': '1.0.0' });
            await helpers.printVersion();
            assert.ok(stubAPI.called);
            assert.ok(stubLog.called);
            stubLog.restore();
            stubAPI.restore();
        });

        it('should display helpMessage', async () => {
            await helpers.printHelpMessage();
            assert.ok(stubLog.called);
            stubLog.restore();
        });

        it('should sort and convert object to a string', () => {
            const res = helpers.versionJSON2String({ mythx: '1.0.1', 'solc': '0.5.0', 'api': '1.0.0' });
            assert.equal(res, 'api: 1.0.0, mythx: 1.0.1, solc: 0.5.0');
        })
    });

    describe('analyze', () => {
        let loggerStub;
        let errorStub;
        let config;
        let getTruffleBuildJsonFilesStub;
        let contractsCompileStub;
        let doAnalysisStub;
        let doReportStub;
        let ghettoReportStub;
        let getIssuesStub;
        let loginStub;
        let pathStub;


        beforeEach(() => {
            getTruffleBuildJsonFilesStub = sinon.stub(trufstuf, 'getTruffleBuildJsonFiles');
            parseBuildJsonStub = sinon.stub(trufstuf, 'parseBuildJson');
            doReportStub = sinon.stub();
            doAnalysisStub = sinon.stub();
            loggerStub = sinon.stub();
            errorStub = sinon.stub();
            ghettoReportStub = sinon.stub();
            getUserInfoStub = sinon.stub(armlet.Client.prototype, 'getUserInfo');
            getIssuesStub = sinon.stub(armlet.Client.prototype, 'getIssues');
            loginStub = sinon.stub(armlet.Client.prototype, 'login');
            contractsCompileStub = sinon.stub();
            pathStub = {
                resolve: sinon.stub(),
                join: path.join
            }

            config = {
                contracts_directory: '/contracts',
                build_directory: '/build/contracts',
                _: [],
                logger: {
                    log: loggerStub,
                    error: errorStub,
                },
                style: 'stylish',
                progress: false,
            };

            helpers = rewire('../helpers');
            helpers.__set__('path', pathStub);
            helpers.__set__('contractsCompile', contractsCompileStub);
            helpers.__set__('doAnalysis', doAnalysisStub);
            helpers.__set__('doReport', doReportStub);
            helpers.__set__('ghettoReport', ghettoReportStub);
        });

        afterEach(() => {
            getTruffleBuildJsonFilesStub.restore();
            getUserInfoStub.restore();
            parseBuildJsonStub.restore();
            getIssuesStub.restore();
            loginStub.restore();
        });

        it('should return error when passed value for limit is not a number', async () => {
            config.limit = 'test';
            await rewiredHelpers.analyze(config);
            assert.equal(loggerStub.getCall(0).args[0], 'limit parameter should be a number; got test.')
        });

        it('should return error when limit is value is out of acceptible range', async () => {
            config.limit = rewiredHelpers.defaultAnalyzeRateLimit + 5;
            await rewiredHelpers.analyze(config);
            assert.equal(loggerStub.getCall(0).args[0], `limit should be between 0 and ${rewiredHelpers.defaultAnalyzeRateLimit}; got ${rewiredHelpers.defaultAnalyzeRateLimit + 5}.`)
        });

        /* TODO: Logged in messaging tests */

        it('should find and analyze the correct build object', async () => {
            config._ = ["verify", "contract.sol:Contract1"];
            const fakeBuildJson = {
                "compiler": { "name": "", "version": "" },
                "updatedAt": "",
                "sources": {
                    "/build/contracts/mythx/contracts/contract.sol": {
                        "contracts": [
                            {
                                "contractName": "Contract1",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            },
                            {
                                "contractName": "Contract2",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            }
                        ],
                        "ast": {},
                        "legacyAST": {},
                        "id": 0,
                        "source": ""
                    }
                }
            }

            pathStub.resolve.returns("/build/contracts/mythx/contracts/contract.sol");

            doAnalysisStub.resolves({ objects: 1, errors: 3 });
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000001',
                  roles: ['regular_user'],
                }
              ]
            });
            getTruffleBuildJsonFilesStub.resolves(['contract.json']);
            parseBuildJsonStub.resolves(fakeBuildJson);

            await helpers.analyze(config);
            assert.ok(pathStub.resolve.calledWith('contract.sol'));
            assert.ok(getTruffleBuildJsonFilesStub.calledWith('/build/contracts/mythx/contracts'));
            assert.ok(getTruffleBuildJsonFilesStub.calledWith('/build/contracts/mythx/contracts'));
            assert.ok(doAnalysisStub.calledWith(sinon.match.any, config, [ { contractName: "Contract1", contract: sinon.match.any} ], helpers.defaultAnalyzeRateLimit));
            assert.ok(doReportStub.calledWith(config, 1, 3));
        });


        it('should call doAnalysis and report issues', async () => {
            const fakeBuildJson = {
                "compiler": { "name": "", "version": "" },
                "updatedAt": "",
                "sources": {
                    "contract.sol": {
                        "contracts": [
                            {
                                "contractName": "Contract1",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            },
                            {
                                "contractName": "Contract2",
                                "bytecode": "0x",
                                "deployedBytecode": "0x",
                                "sourceMap": "",
                                "deployedSourceMap": ""
                            }
                        ],
                        "ast": {},
                        "legacyAST": {},
                        "id": 0,
                        "source": ""
                    }
                }
            }
            doAnalysisStub.resolves({ objects: 1, errors: 3 });
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000001',
                  roles: ['regular_user'],
                }
              ]
            });
            getTruffleBuildJsonFilesStub.resolves(['test.json']);
            parseBuildJsonStub.resolves(fakeBuildJson);

            await helpers.analyze(config);
            assert.ok(getTruffleBuildJsonFilesStub.calledWith('/build/contracts/mythx/contracts'));
            assert.ok(doAnalysisStub.called);
            assert.ok(doReportStub.calledWith(config, 1, 3));
        });

        it('should call getIssues when uuid is provided', async () => {
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000002',
                  roles: ['regular_user', 'privlidged_user'],
                }
              ]
            });
            config.uuid = 'test';
            await helpers.analyze(config);
            assert.ok(getIssuesStub.called);
            assert.ok(ghettoReportStub.called);
        });

        it('should show error when getIssues break', async () => {
            config.uuid = 'test';
            getIssuesStub.throws('Error')
            getUserInfoStub.resolves({
              total: 1,
              users: [
                { id: '000000000000000000000001',
                  roles: ['regular_user'],
                }
              ]
            });
            await helpers.analyze(config);
            assert.ok(getIssuesStub.called);
            assert.ok(loggerStub.getCall(0).args[0], 'Error');
        });
    });

    describe('doAnalysis', () => {
        let armletClient, stubAnalyze, debuggerStub;

        beforeEach(() => {
            armletClient = new armlet.Client({
                ethAddress: rewiredHelpers.trialEthAddress,
                password: rewiredHelpers.trialPassword
            });
            stubAnalyze = sinon.stub(armletClient, 'analyzeWithStatus');
            debuggerStub = sinon.stub();
        });

        afterEach(() => {
            stubAnalyze.restore();
            stubAnalyze = null;
        });

        it('should return 1 mythXIssues object and no errors', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const objContracts = [ { contractName: "SimpleDAO", contract: contracts[0] } ];
            const mythXInput = mythx.truffle2MythXJSON(objContracts[0].contract);
            stubAnalyze.resolves({
                issues: [{
                    'sourceFormat': 'evm-byzantium-bytecode',
                    'sourceList': [
                        `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`
                    ],
                    'sourceType': 'raw-bytecode',
                    'issues': [{
                        'description': {
                            'head': 'Head message',
                            'tail': 'Tail message'
                        },
                        'locations': [{
                            'sourceMap': '444:1:0'
                        }],
                        'severity': 'High',
                        'swcID': 'SWC-000',
                        'swcTitle': 'Test Title'
                    }],
                    'meta': {
                        'selected_compiler': '0.5.0',
                        'error': [],
                        'warning': []
                    }
                }],
                status: { status: 'Finished' },
            });
            const results = await doAnalysis(armletClient, config, objContracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
            }, 300000, undefined));
            assert.equal(results.errors.length, 0);
            assert.equal(results.objects.length, 1);
        });

        it('should return 0 mythXIssues objects and 1 error', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const objContracts = [ { contractName: "SimpleDAO", contract: contracts[0] } ];
            const mythXInput = mythx.truffle2MythXJSON(objContracts[0].contract);
            stubAnalyze.resolves({
                issues: [],
                status: { status: 'Error'},
            });
            const results = await doAnalysis(armletClient, config, objContracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
            }, 300000, undefined));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 0);
        });

        it('should return 1 mythXIssues object and 1 error', async () => {
            const doAnalysis = rewiredHelpers.__get__('doAnalysis');
            const config = {
                _: [],
                debug: true,
                logger: {debug: debuggerStub},
                style: 'test-style',
                progress: false,
            }
            const jsonFile = `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`;
            const simpleDaoJSON = await util.promisify(fs.readFile)(jsonFile, 'utf8');
            const contracts = mythx.newTruffleObjToOldTruffleByContracts(JSON.parse(simpleDaoJSON));
            const objContracts = [ { contractName: "SimpleDAO", contract: contracts[0] }, { contractName: "SimpleDAO", contract: contracts[0] } ];
            const mythXInput = mythx.truffle2MythXJSON(objContracts[0].contract);
            stubAnalyze.onFirstCall().resolves({
                issues: {},
                status: { status: 'Error' },
            });
            stubAnalyze.onSecondCall().resolves({
                issues: [{
                    'sourceFormat': 'evm-byzantium-bytecode',
                    'sourceList': [
                        `${__dirname}/sample-truffle/simple_dao/build/mythx/contracts/simple_dao.json`
                    ],
                    'sourceType': 'raw-bytecode',
                    'issues': [{
                        'description': {
                            'head': 'Head message',
                            'tail': 'Tail message'
                        },
                        'locations': [{
                            'sourceMap': '444:1:0'
                        }],
                        'severity': 'High',
                        'swcID': 'SWC-000',
                        'swcTitle': 'Test Title'
                    }],
                    'meta': {
                        'selected_compiler': '0.5.0',
                        'error': [],
                        'warning': []
                    },
                }],
                status: {status: 'Pending' },
            });
            const results = await doAnalysis(armletClient, config, objContracts);
            mythXInput.analysisMode = 'quick';
            assert.ok(stubAnalyze.calledWith({
                clientToolName: 'truffle',
                data: mythXInput,
                noCacheLookup: false,
            }, 300000, undefined));
            assert.equal(results.errors.length, 1);
            assert.equal(results.objects.length, 1);
        });
    });

    describe('cleanAnalyzeDataEmptyProps', () => {
        const contractJSON = `${__dirname}/sample-truffle/simple_dao/build/contracts/SimpleDAO.json`;
        let truffleJSON;

        beforeEach(done => {
            fs.readFile(contractJSON, 'utf8', (err, data) => {
                if (err) return done(err);
                truffleJSON = JSON.parse(data);
                done();
            });
        });

        it('should return complete input data when all fields are present', () => {
            const stub = sinon.stub();
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(!stub.called);
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit bytecode when bytecode is empty', () => {
            const stub = sinon.stub();
            truffleJSON.bytecode = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.bytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit bytecode when bytecode is 0x', () => {
            const stub = sinon.stub();
            truffleJSON.bytecode = '0x';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.bytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedBytecode when deployedBytecode is empty', () => {
            const stub = sinon.stub();
            truffleJSON.deployedBytecode = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.deployedBytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedBytecode when deployedBytecode is 0x', () => {
            const stub = sinon.stub();
            truffleJSON.deployedBytecode = '0x';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.deployedBytecode;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit sourceMap when sourceMap is empty', () => {
            const stub = sinon.stub();
            truffleJSON.sourceMap = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.sourceMap;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit deployedSourceMap when deployedSourceMap is empty', () => {
            const stub = sinon.stub();
            truffleJSON.deployedSourceMap = '';
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, true, stub);
            assert.ok(stub.called);
            delete truffleJSON.deployedSourceMap;
            assert.deepEqual(result, truffleJSON);
        });

        it('should omit empty fields but not log  when debug is false', () => {
            const stub = sinon.stub();
            truffleJSON.deployedSourceMap = '';
            truffleJSON.sourceMap = null;
            truffleJSON.bytecode = '0x';
            delete truffleJSON.deployedBytecode;
            const result = rewiredHelpers.cleanAnalyzeDataEmptyProps(truffleJSON, false, stub);
            delete truffleJSON.sourceMap;
            delete truffleJSON.deployedSourceMap;
            delete truffleJSON.bytecode;
            delete truffleJSON.deployedBytecode;
            assert.ok(!stub.called);
            assert.deepEqual(result, truffleJSON);
        });
    });

    describe('doReport', () => {
        let loggerStub;
        let errorStub;
        let config;

        beforeEach(() => {
            loggerStub = sinon.stub();
            errorStub = sinon.stub();

            config = {
                logger: {
                    log: loggerStub,
                    error: errorStub,
                },
                json: true,
            };
        });

        it('should return 0 when no errors, no issues, and no logs', async () => {
            const results = {
                "errors": [],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors);
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 0);
        });

        it('should return 1 when errors is 1 or more', async () => {
            const results = {
                "errors": [
                    {
                      "status": "Error"
                    }
                ],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors);
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });

        it('should return 1 when issues is 1 or more', () => {
            const results = {
                "errors": [],
                "objects": [
                    {
                        issues: [
                            {
                                "issues": [{
                                    'description': {
                                        'head': 'Head message',
                                        'tail': 'Tail message'
                                    },
                                    'locations': [{
                                        'sourceMap': '444:1:0'
                                    }],
                                    'severity': 'High',
                                    'swcID': 'SWC-000',
                                    'swcTitle': 'Test Title'
                                }],
                            }
                        ],
                        logs: []
                    },
                    {
                        issues: [
                            {
                                "issues": []
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors);
            assert.ok(!loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });

        it('should return 0 when logs is 1 or more with debug', async () => {
            config.debug = true;
            const results = {
                errors: [],
                objects: [
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: [
                            {
                                level : 'info',
                                msg: 'message1',
                            }
                        ]
                    },
                    {
                        issues: [
                            {
                                "issues": [],
                            }
                        ],
                        logs: []
                    }
                ]
            };
            const ret = rewiredHelpers.__get__('doReport')(config, results.objects, results.errors);
            assert.ok(loggerStub.calledWith('MythX Logs:'.yellow));
            assert.ok(!errorStub.calledWith('Internal MythX errors encountered:'.red));
            assert.equal(ret, 1);
        });
    });

    describe('ghettoReport', () => {
        let loggerStub = sinon.stub();
        beforeEach(() => {
            loggerStub = sinon.stub();
        });

        it('should return 0 when issues count is 0', () => {
            const results = [{
                "issues": [],
            }];
            const ret = rewiredHelpers.__get__('ghettoReport')(loggerStub, results);
            assert.ok(loggerStub.calledWith('No issues found'));
            assert.equal(ret, 0);
        });

        it('should return 1 when issues count is 1 or more', () => {
            const results = [{
                'sourceFormat': 'evm-byzantium-bytecode',
                'sourceList': [
                    'list1', 'list2'
                ],
                'sourceType': 'raw-bytecode',
                'issues': [{
                    'description': {
                        'head': 'Head message',
                        'tail': 'Tail message'
                    },
                    'locations': [{
                        'sourceMap': '444:1:0'
                    }],
                    'severity': 'High',
                    'swcID': 'SWC-000',
                    'swcTitle': 'Test Title'
                }],
                'meta': {
                    'selected_compiler': '0.5.0',
                    'error': [],
                    'warning': []
                }
            }];

            const ret = rewiredHelpers.__get__('ghettoReport')(loggerStub, results);
            assert.ok(!loggerStub.calledWith('No issues found'));
            assert.ok(loggerStub.calledWith('list1, list2'.underline));
            assert.ok(loggerStub.calledWith(yaml.safeDump(results[0].issues[0], {'skipInvalid': true})));
            assert.equal(ret, 1);
        });
    });

    describe('prepareConfig', () => {
        it('should return a numeric severityThreshold', () => {
            const inputSeverity = 'error';
            const result = helpers.setConfigSeverityLevel(inputSeverity);
            assert.equal(result, 2);
        });
        it('should default to warning if no severity is supplied', () => {
            const result = helpers.setConfigSeverityLevel();
            assert.equal(result, 1);
        });
        it('should correctly format a comma separated string of swc codes', () => {
            const commaBlacklist = '103,111';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-103', 'SWC-111' ]);
        });
        it('should correctly format a single swc code', () => {
            const commaBlacklist = '103';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-103' ]);
        });
        it('should accept whitespace in the list of swc codes', () => {
            const commaBlacklist = '103, 111';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-103', 'SWC-111' ]);
        });
        it('should accept an arbitrary string as an SWC code without breaking', () => {
            const commaBlacklist = 'cat';
            const result = helpers.setConfigSWCBlacklist(commaBlacklist);
            assert.deepEqual(result, [ 'SWC-cat' ]);
        });
    });

    describe('getArmletClient', () => {
        it('should instantiate as trial user if nothing is passed', () => {
            const client = rewiredHelpers.getArmletClient();
            assert.equal(client.ethAddress, rewiredHelpers.trialEthAddress);
            assert.equal(client.password, rewiredHelpers.trialPassword);
        });

        it('should create client instance with ethAddress and password', () => {
            const client = rewiredHelpers.getArmletClient('0x123456789012345678901234', 'password');
            assert.equal(client.ethAddress, '0x123456789012345678901234');
            assert.equal(client.password, 'password');
        });

        it('should throw error if password is missing', () => {
            assert.throws(() => {
                rewiredHelpers.getArmletClient(undefined, '0x123456789012345678901234')
            });
        });

        it('should throw error if ethAddress is missing', () => {
            assert.throws(() => {
                rewiredHelpers.getArmletClient('password', undefined)
            });
        });
    });

    describe('getMythXJSClient', () => {
      it('should instantiate as trial user if nothing is passed', () => {
          const client = rewiredHelpers.getArmletClient();
          assert.equal(client.ethAddress, rewiredHelpers.trialEthAddress);
          assert.equal(client.password, rewiredHelpers.trialPassword);
      });

      it('should create client instance with ethAddress and password', () => {
          const client = rewiredHelpers.getArmletClient('0x123456789012345678901234', 'password');
          assert.equal(client.ethAddress, '0x123456789012345678901234');
          assert.equal(client.password, 'password');
      });

      it('should throw error if password is missing', () => {
          assert.throws(() => {
              rewiredHelpers.getArmletClient(undefined, '0x123456789012345678901234')
          });
      });

      it('should throw error if ethAddress is missing', () => {
          assert.throws(() => {
              rewiredHelpers.getArmletClient('password', undefined)
          });
      });
  });

});
