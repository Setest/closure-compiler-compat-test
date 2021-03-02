Тестирует прохождение через компилятор синтаксиса ECMA.

#### Установка
- клонируем
- `npm install`
- скачать и положить в папку `compilers` нужную версию компилятора, берем из 
[https://mvnrepository.com/artifact/com.google.javascript/closure-compiler]
- создать в корне `config.json`
- запуск тестов `npm start` после чего будут созданы отчеты в папке `reports`

[config.json]
```js
{
    "compilerBinaryFileName" : "closure-compiler-v20210202.jar", // бинарник должен лежать в compilers
    "compilerOptions": "--compilation_level ADVANCED --checks_only", // доп параметры запуска
    "async" : false, // запуск всех тестов синхронно, очень тяжелая процедура
    "tests" : ["data-es5", "data-es6"] // файлы тестов из папки node_modules/compat-table/
}
```