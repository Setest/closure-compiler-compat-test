Test capabilities of Google Closure Compiler with modern ECMA script syntax.
In a result it created XLS table which contain all features of ECMA script which
is not provided by Google Closure Compiler.

Its an old task and was created for discovered problem which invoked randomly
in old fashion browsers after deploy.

Тестирует прохождение через компилятор синтаксиса ECMA.

#### Установка
- клонируем
- `npm install`
- скачать и положить в папку `compilers` нужную версию компилятора, берем из 
[mvnrepository.com](https://mvnrepository.com/artifact/com.google.javascript/closure-compiler)
- создать в корне `config.json`
- запуск тестов `npm start` после чего будут созданы отчеты в папке `reports`

##### `config.json`
```js
{
    "compilerBinaryFileName" : "closure-compiler-v20210202.jar", // бинарник должен лежать в compilers
    "compilerOptions": "--compilation_level ADVANCED --checks_only", // доп параметры запуска
    "async" : false, // запуск всех тестов синхронно, очень тяжелая процедура
    "tests" : ["data-es5", "data-es6"] // файлы тестов из папки node_modules/compat-table/
}
```

##### TODO
- добавить сохранение отчета в синхронном режиме при отправки SIGINT, SIGTERM