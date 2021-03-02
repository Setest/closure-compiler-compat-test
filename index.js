const fs = require('fs');
const path = require('path');
const md5 = require('md5');
const fsExtra = require('fs-extra')
const config = require('./config.json');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const execSync = require('child_process').execSync;
const ExcelJS = require('exceljs');

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
        for (let testName in testsResult) {
            createReport(testName, testsResult[testName]);
        }

    }).catch(err => console.log(err));
});

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
        // console.log(`stdout: ${stdout}`, stdout);
        data = JSON.parse(data);
        if (Array.isArray(data) && data.length > 1) {
            success = false;
            data.forEach(function (msg) {
                if (!['info'].includes(msg.level)) {
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

// Run test / subtests, recursively.  Report results, indicate data files
// which are out of date.
function runTest(parents, test, sublevel, testFileName) {
    let testPath = parents.join(' -> ') + ' -> ' + test.name;
    testsResult[testFileName] = testsResult[testFileName] || [];

    if (typeof test.exec === 'function') {
        let src = test.exec.toString();
        let m = /^function\s*\w*\s*\(.*?\)\s*\{\s*\/\*([\s\S]*?)\*\/\s*\}$/m.exec(src);
        let code;
        if (m) {
            code = '(function test() {' + m[1] + '})();';
        } else {
            code = '(' + src + ')()';
        }

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
                //     console.error('x', x);
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