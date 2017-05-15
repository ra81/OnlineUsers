
/// <reference path= "../../_jsHelper/jsHelper/jsHelper.ts" />
/////// <reference path= "../../XioPorted/PageParsers/2_IDictionary.ts" />
/////// <reference path= "../../XioPorted/PageParsers/7_PageParserFunctions.ts" />
/////// <reference path= "../../XioPorted/PageParsers/1_Exceptions.ts" />

$ = jQuery = jQuery.noConflict(true);
$xioDebug = true;
//let Realm = getRealmOrError();
//let CurrentGameDate = parseGameDate(document, document.location.pathname);
let DataVersion = 2;    // версия сохраняемых данных. При изменении формата менять и версию
let StorageKeyCode = "onus";
let RealmList = ["anna", "vera", "olga", "mary", "lien"];

interface IStoreItem1 {
    pid: number;
    pname: string;
    company: string;
    dayCount: number;           // сколько дней попадался
    count: number;              // сколько раз всего игрок встречался
    lastSeenDate: string;       // дата в шорт формате строкой
}

interface IStoreItem2 {
    pid: number;
    pname: string;
    company: string;
    regDate: string;
    dayCount: number;           // сколько дней попадался
    count: number;              // сколько раз всего игрок встречался
    lastSeenDate: string;       // дата в шорт формате строкой
}

// упрощаем себе жисть, подставляем имя скрипта всегда в сообщении
function log(msg: string, ...args: any[]) {
    msg = "online: " + msg;
    logDebug(msg, ...args);
}


function Start() {

    let $tbl = $("table.grid");
    let $online = $("<div></div>");
    $tbl.before($online);

    // зачистить старую историю
    let $clearBtn = $("<input type='button' id='clearOnline' value=' Clear All Realms '>");
    $clearBtn.on("click", () => {
        for (let realm of RealmList) {
            let key = buildStoreKey(realm, StorageKeyCode);
            log("removing key ", key);
            localStorage.removeItem(key);
        }
    });

    // экспортировать данные
    let $exportBtn = $("<input type='button' id='exportOnline' value=' Export All Realms '>");
    $exportBtn.on("click", () => {
        exportData($online);
    });

    // кнопки выводим
    $online.append($exportBtn);
    $online.append($clearBtn);

    // запуск сбора данных
    timerStart();
}

function timerStart() {

    setInterval(onTime_async, 1000 * 60 * 30);  // раз в 30 мин

    async function onTime_async() {
        for (let realm of RealmList) {
            let info = await getInfo_async(realm);
            saveInfo(realm, info);
        }
    }
}

async function getInfo_async(realm: string): Promise<IDictionaryN<IStoreItem2>> {

    let url = `/${realm}/main/user/list/online`;
    await tryGet_async(`/${realm}/main/common/util/setpaging/usermain/getUserListOnline/20000`);
    let html = await tryGet_async(url);
    let gameDate = parseGameDate(html, url);
    let $rows = $(html).find("tr.even, tr.odd");

    let dict: IDictionaryN<IStoreItem2> = {};
    $rows.each((i, el) => {
        let $r = $(el);

        let $a = $r.find("a[href*='user/view/']");
        if ($a.length <= 0) {
            log("чет не нашел тег <a> для ", $r.text());
            return;
        }

        let n = extractIntPositive($a.attr("href"));
        if (n == null) {
            log("чет не нашел pid в " + $a.attr("href"));
            return;
        }

        let pid = n[0];
        let pname = $a.text();
        let company = $r.children("td").eq(2).text();
        let regDate = extractDate($r.children("td").eq(3).text());
        if (regDate == null)
            throw new Error(`не нашел дату регистрации для ${pid}: ${pname}`);


        dict[pid] = {
            pid: pid,
            pname: pname,
            company: company,
            count: 1,
            dayCount: 1,
            lastSeenDate: dateToShort(gameDate),
            regDate: dateToShort(regDate)
        }
    });

    return dict;
}

function exportData($place: JQuery) {

    if ($place.length <= 0)
        return false;

    if ($place.find("#txtExport").length > 0) {
        $place.find("#txtExport").remove();
        return;
    }

    let $txt = $('<textarea id="txtExport" style="display:block;width: 800px; height: 200px"></textarea>');

    let totalStr = "realm;pid;pname;company;regdate;daycount;count;lastseen\n";
    for (let realm of RealmList) {
        let storeKey = buildStoreKey(realm, StorageKeyCode);
        let str = localStorage.getItem(storeKey);
        if (str == null)
            throw new Error("что то пошло не так при экспорте");

        let storedInfo = JSON.parse(str) as [number, IDictionaryN<IStoreItem2>];
        let info = storedInfo[1];

        for (let key in info) {
            let item = info[key];
            let str = formatStr("{0};{1};{2};{3};{4};{5};{6};{7}",
                realm, item.pid, item.pname, item.company, item.regDate, item.dayCount, item.count, item.lastSeenDate);

            totalStr += str + "\n";
        }
    }

    $txt.text(totalStr);
    $place.append($txt);
    return true;
}

function saveInfo(realm: string, parsedInfo: IDictionaryN<IStoreItem2>) {

    let loadedInfo = loadInfo(realm);
    for (let pid in parsedInfo) {
        let parsed = parsedInfo[pid];
        let loaded = loadedInfo[pid];

        if (loaded == null) {
            loaded = parsed;
        }
        else {
            loaded.count++;

            // счетчик дней
            if (dateFromShort(loaded.lastSeenDate) < dateFromShort(parsed.lastSeenDate)) {
                loaded.lastSeenDate = parsed.lastSeenDate;
                loaded.dayCount++;
            }
            else if (dateFromShort(loaded.lastSeenDate) > dateFromShort(parsed.lastSeenDate)) {
                // вообще такого быть не должно но косяк со сбором данных вер1 к такому мог приводить
                log(`дата послед наблюдения pid: ${pid}, stored: ${loaded.lastSeenDate} > parsed: ${parsed.lastSeenDate}`);
                loaded.lastSeenDate = parsed.lastSeenDate;
                loaded.dayCount++;
            }

            // если дата реги не стоит то обновить
            if (loaded.regDate.length <= 0)
                loaded.regDate = parsed.regDate;
        }

        loadedInfo[pid] = loaded;
    }

    // сохраним назад
    let storeKey = buildStoreKey(realm, StorageKeyCode);
    localStorage[storeKey] = JSON.stringify([DataVersion, loadedInfo]);
    log("saved to " + storeKey, [DataVersion, loadedInfo]);
}

/**
 * Даже если в хранилище пусто вернет пустой словарь. Если тип данных устарел то конвертает до текущего
 * @param realm
 */
function loadInfo(realm: string): IDictionaryN<IStoreItem2> {

    let storeKey = buildStoreKey(realm, StorageKeyCode);
    let raw = localStorage[storeKey];
    if (raw == null)
        return {};

    let ver: number;
    let info: any;
    [ver, info] = JSON.parse(raw);

    // добавляем новую информацию
    if (ver === DataVersion)
        return info;

    if (ver === 1) {
        log(`${realm} => ver:1 конверсия до ${DataVersion}`);
        let info1 = info as IDictionaryN<IStoreItem1>;
        let info2: IDictionaryN<IStoreItem2> = {};

        for (let pid in info1) {
            let item1 = info1[pid];
            info2[pid] = {
                pid: item1.pid,
                pname: item1.pname,
                company: item1.company,
                count: item1.count,
                dayCount: item1.dayCount,
                lastSeenDate: item1.lastSeenDate,
                regDate: ""
            };
        }
        return info2;
    }

    throw new Error("не обработана версионность данных");
}


/**
 * Со странички пробуем спарсить игровую дату. А так как дата есть почти везде, то можно почти везде ее спарсить
 * Вывалит ошибку если не сможет спарсить дату со странички
 * @param html
 * @param url
 */
function parseGameDate(html: any, url: string): Date {
    let $html = $(html);

    try {
        // вытащим текущую дату, потому как сохранять данные будем используя ее
        let $date = $html.find("div.date_time");
        if ($date.length !== 1)
            throw new Error("Не получилось получить текущую игровую дату");

        let currentGameDate = extractDate(getOnlyText($date)[0].trim());
        if (currentGameDate == null)
            throw new Error("Не получилось получить текущую игровую дату");

        return currentGameDate;
    }
    catch (err) {
        throw err;
    }
}


$(document).ready(() => Start());