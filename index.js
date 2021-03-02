const fs = require('fs');
const path = require('path');
const md5 = require('md5');
const fsExtra = require('fs-extra')
const config = require('./config.json');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const execSync = require('child_process').execSync;
const ExcelJS = require('exceljs');
// const ON_DEATH = require('death');

// const stringifyObject = require('stringify-object');
// const beautify = require("json-beautify");
// const ClosureCompiler = require('google-closure-compiler').compiler;

const promises = [];
const testsResult = {};
const tmpFolderPath = './tmp/';
const reportsPath = './reports/'
const compilersPath = './compilers/'
const compatTableModuleName = "compat-table"
let totalAmount = 0;
let testCount = 1;

// Begin reading from stdin so the process does not exit imidiately
// process.stdin.resume();
// process.on('SIGINT', function() {
//     console.log('Interrupted');
//     process.exit();
// });


const createIterableHelper =
    'var global = this;\n' +
    'global.__createIterableObject = function (arr, methods) {\n' +
    '    methods = methods || {};\n' +
    '    if (typeof Symbol !== "function" || !Symbol.iterator)\n' +
    '      return {};\n' +
    '    arr.length++;\n' +
    '    var iterator = {\n' +
    '      next: function() {\n' +
    '        return { value: arr.shift(), done: arr.length <= 0 };\n' +
    '      },\n' +
    '      "return": methods["return"],\n' +
    '      "throw": methods["throw"]\n' +
    '    };\n' +
    '    var iterable = {};\n' +
    '    iterable[Symbol.iterator] = function(){ return iterator; };\n' +
    '    return iterable;\n' +
    '  };\n';

const asyncTestHelperHead =
    'var asyncPassed = false;\n' +
    '\n' +
    'function asyncTestPassed() {\n' +
    '  asyncPassed = true;\n' +
    '}\n' +
    '\n' +
    'function setTimeoutDisabled(cb, time, cbarg) {\n' +
    '  if (!jobqueue[time]) {\n' +
    '    jobqueue[time] = [];\n' +
    '  }\n' +
    '  jobqueue[time].push({cb, cbarg, startTime: Date.now(), timeout: time});\n' +
    '}\n' +
    '\n' +
    'var jobqueue = [];\n';

const asyncTestHelperTail =
    'const thenCb = job => {\n' +
    '  job.cb(job.cbarg)\n' +
    '}\n' +
    '\n' +
    'const catchCb = job => {\n' +
    '  jobRunner(job);\n' +
    '}\n' +
    '\n' +
    'function jobRunner(job){\n' +
    '  return new Promise((resolve, reject) => {\n' +
    '    let diff = Date.now() - job.startTime;\n' +
    '    if (diff >= job.timeout) {\n' +
    '      if (!job.run) {\n' +
    '        job.run = true;\n' +
    '        resolve (job);\n' +
    '      }\n' +
    '    } else {\n' +
    '      reject (job)\n' +
    '    }\n' +
    '  })\n' +
    '  .then(thenCb)\n' +
    '  .catch(catchCb)\n' +
    '}\n' +
    '\n' +
    'jobqueue.forEach(function(jobs, index) {\n' +
    '  for (var job of jobs) {\n' +
    '    jobRunner(job);\n' +
    '  }\n' +
    '});\n' +
    '\n' +
    'function onCloseAsyncCheck() {\n' +
    '  if (!asyncPassed) {\n' +
    '    testIsFailture();\n' +
    // '    console.error("Async[FAILURE]");\n' +
    // '    print("Async[FAILURE]");\n' +
    // '    throw "Async check failed";\n' +
    '  }\n' +
    // '  print("[SUCCESS]");\n' +
    '}\n';

ON_DEATH(function(signal, err) {
    console.log('ok')
//     // process.kill(process.pid, "SIGINT");
    generateReports();
})

fsExtra.emptyDirSync(tmpFolderPath);

if (fsExtra.pathExists()) {
    fsExtra.emptyDirSync(reportsPath);
} else {
    fsExtra.mkdir(reportsPath)
}


const compatTableModule = path.relative('./', path.dirname(require.resolve(compatTableModuleName)));
if (!compatTableModule) {
    console.error(compatTableModuleName + ' module not installed!');
    return;
}

fs.readdirSync(compatTableModule).forEach(function (filename) {
    let m = /^(data-.*)\.js$/.exec(filename);

    if (!m) {
        return;
    }

    if (config.tests && config.tests.length && !config.tests.includes(m[1])) {
        return;
    }

    let suitename = m[1];

    console.log('');
    console.log('**** ' + suitename + ' ****');
    console.log('');

    let testsuite = require(`${compatTableModuleName}/${suitename}`);

    testsuite.tests.forEach(function (v) {
        if (v.subtests) {
            totalAmount += v.subtests.length
        }

        if (v.exec) {
            totalAmount++;
        }

        runTest([suitename], v, 0, suitename);
    });


    Promise.all(promises).then(() => {
        generateReports();
    }).catch(err => console.log(err));
});

function generateReports(){
    for (let testName in testsResult) {
        createReport(testName, testsResult[testName]);
    }
};

function createReport(name = '', data = []) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Me';
    workbook.lastModifiedBy = 'Her';
    workbook.created = new Date(1985, 8, 30);
    workbook.modified = new Date();
    workbook.lastPrinted = new Date(2016, 9, 27);

    const worksheet = workbook.addWorksheet('My Sheet');

    const columnConfigDefault = {
        width: 50,
        // style: {font:{bold: true, size: 12}}
    }

    let columns = [{
            header: 'Hash',
            key: 'hash',
            width: 10
        },
        {
            header: 'Success',
            key: 'success',
            width: 10
        },
        {
            header: 'Name',
            key: 'name',
            width: 32,
            style: {font: {bold: true, size: 12}},
        },
        {
            header: 'Error',
            key: 'error',
            width: 32
        },
        {
            header: 'Warning',
            key: 'warning',
            width: 32
        },
        {
            header: 'Source',
            key: 'code',
            width: 32,

        },
    ];

    for (const column in columns) {
        if (Object.hasOwnProperty.call(columns, column)) {
            columns[column] = Object.assign({}, columnConfigDefault, columns[column]);
        }
    }

    worksheet.getRow(1).font = {size: 14, bold: true};

    worksheet.columns = columns

    let defaultAlignment = {wrapText: true, vertical: 'top', horizontal: 'left'};
    data.forEach(currentTest => {
        currentTest.error = currentTest.error.length ? currentTest.error : '';
        currentTest.warning = currentTest.warning.length ? currentTest.warning : '';

        let newRow = worksheet.addRow(currentTest);

        newRow.getCell(2).alignment = {vertical: 'middle', horizontal: 'center'};
        newRow.getCell(3).alignment = {wrapText: true, vertical: 'middle', horizontal: 'left'};

        if (currentTest.error.length) {
            newRow.getCell(2).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {argb: 'EA5151'},
            };

            newRow.getCell(4).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {argb: 'EA5151'},
            };
        }

        if (currentTest.warning.length) {
            newRow.getCell(5).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {argb: 'FDFFA6'},
            };
        }

        newRow.getCell(4).alignment = defaultAlignment;
        newRow.getCell(5).alignment = defaultAlignment;
        newRow.getCell(6).alignment = defaultAlignment;
    });

    workbook.xlsx.writeFile(reportsPath + name + '.xlsx');
}

function execPromise(command) {
    return new Promise(function (resolve, reject) {
        exec(command, function (error, stdout, stderr) {
            // console.warn(arguments);
            // if (error) {
            //     reject(error, stderr);
            //     return;
            // }

            // resolve(stdout.trim());
            resolve(stderr, error);
        });
    });
}

function analyze({data = '[]', testPath = '', testFileName = '', hashFileName = '', code = '', hash = ''}) {
    let success = true;
    let result = {
        name: testPath,
        hashFileName,
        code,
        hash,
        error: [],
        warning: []
    };
    if (data) {
        // console.log(data);
        data = JSON.parse(data);
        if (Array.isArray(data) && data.length > 1) {
            success = false;
            data.forEach(function (msg) {
                if (!['info'].includes(msg.level)) {
                    if (msg.description.includes('testIsFailture') && data.length == 2){
                        success = true;
                        return;
                    }
                    result[msg.level].push(msg);
                    // a[msg.level].push(beautify(msg, null, 2, 80));
                    // a[msg.level].push(stringifyObject(msg, {
                    //     indent: '  ',
                    //     singleQuotes: false
                    // }));
                }
            })
        }
    }
    result.success = success;
    testsResult[testFileName].push(result);
    console.log(`${testCount}/${totalAmount} ${(success ? 'success' : 'ERROR')} - ${testPath}`);
    testCount++;
}

function prepareCode(src){

    let m = /^function\s*\w*\s*\(.*?\)\s*\{\s*\/\*([\s\S]*?)\*\/\s*\}$/m.exec(src);
    let evalcode = '';
    let script = '';

    if (src.includes('__createIterableObject')) {
        script += createIterableHelper;
    } else if (src.includes('global')) {
        script += 'var global = this;\n';
    }

    if (src.includes('asyncTestPassed')) {
        script += asyncTestHelperHead + '(function test() {' + m[1] + '})();' + asyncTestHelperTail;
    } else {
        if (m) {
            evalcode = '(function test() {' + m[1] + '})();';
        } else {
            evalcode = '(' + src + ')();';
        }

        script += evalcode;
        script += 'var evalcode = ' + JSON.stringify(evalcode) + ';\n' +
            'try {\n' +
            '    var res = eval(evalcode);\n' +
            '    if (!res) { throw new Error("failed: " + res); }\n' +
            // '    print("[SUCCESS]");\n' +
            '} catch (e) {\n' +
            '    testIsFailture()' +
            // '    console.error("[FAILURE]");\n' +
            // '    print("[FAILURE]", e);\n' +
            // '    throw e;\n' +
            '}\n';
    }
    return script;
}

// Run test / subtests, recursively.  Report results, indicate data files
// which are out of date.
function runTest(parents, test, sublevel, testFileName) {
    let testPath = parents.join(' -> ') + ' -> ' + test.name;
    testsResult[testFileName] = testsResult[testFileName] || [];

    if (typeof test.exec === 'function') {
        let src = test.exec.toString();

        code = prepareCode(src);
        // console.log(code);

        let hash = md5(testPath);
        let hashFileName = tmpFolderPath + hash + '.js';

        fs.writeFileSync(hashFileName, code);

        // более элегантное решение это использовать NPM пакет, но тогда надо в промисы оборачивать
        // https://www.npmjs.com/package/google-closure-compiler
        // let compilerPromise = (config.compilerBinaryFileName)
        // ? execPromise(`java -jar closure-compiler-v20210202.jar --js ${hashFileName} --error_format JSON  --compilation_level ADVANCED --checks_only`)
        // : ;

        // const closureCompiler = new ClosureCompiler({
        //     js: hashFileName,
        //     compilation_level: 'ADVANCED'
        // });

        // const compilerProcess = closureCompiler.run((exitCode, stdOut, stdErr) => {
        //     console.log('compilation complete');
        // });


        // ' --languageIn=ECMASCRIPT6 --languageOut=ECMASCRIPT5 --rewritePolyfills --warningLevel=QUIET'
        let compilerExecuteCmd = `java -jar ${compilersPath}${config.compilerBinaryFileName} --js ${hashFileName} --error_format JSON ${config.compilerOptions}`;
        if (config.async) {
            promises.push(
                execPromise(compilerExecuteCmd)
                    .then((data) => analyze({data, testPath, testFileName, hashFileName, code, hash})
                    )
                // .catch(function(e, x) {
                //     console.error('e', e.message);
                // })
            )
        } else {
            let data = '';
            // инфа по отлову ошибок https://stackoverflow.com/questions/30134236/use-child-process-execsync-but-keep-output-in-console
            try{
                data = execSync(compilerExecuteCmd + ' 2>&1').toString();
            }catch (e) {
                data = e.stdout.toString();
            }
            analyze({data, testPath, testFileName, hashFileName, code, hash})
        }

    }
    if (test.subtests) {
        let newParents = parents.slice(0);
        newParents.push(test.name);
        test.subtests.forEach(function (v) {
            runTest(newParents, v, sublevel + 1, testFileName);
        });
    }
}