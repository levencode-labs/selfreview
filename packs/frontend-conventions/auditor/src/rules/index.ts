import type { Rule } from "../engine/types.js";
import { corpusRules } from "./corpusConventions.js";

import { fs1 } from "./fs/fs1.js";
import { fs2 } from "./fs/fs2.js";
import { fs4 } from "./fs/fs4.js";
import { fs5 } from "./fs/fs5.js";
import { fs6 } from "./fs/fs6.js";
import { fs7auto } from "./fs/fs7auto.js";
import { fs8 } from "./fs/fs8.js";
import { fs12 } from "./fs/fs12.js";
import { fs13 } from "./fs/fs13.js";
import { fs14 } from "./fs/fs14.js";
import { fs15 } from "./fs/fs15.js";

import { mvvm1 } from "./mvvm/mvvm1.js";
import { mvvm2 } from "./mvvm/mvvm2.js";
import { mvvm4 } from "./mvvm/mvvm4.js";
import { mvvm5 } from "./mvvm/mvvm5.js";
import { mvvm7 } from "./mvvm/mvvm7.js";
import { mvvm9 } from "./mvvm/mvvm9.js";
import { mvvm10 } from "./mvvm/mvvm10.js";
import { mvvm11 } from "./mvvm/mvvm11.js";

import { react1 } from "./react/react1.js";
import { react2 } from "./react/react2.js";
import { react3 } from "./react/react3.js";
import { react4 } from "./react/react4.js";
import { react7 } from "./react/react7.js";
import { react8 } from "./react/react8.js";
import { react9 } from "./react/react9.js";
import { react10 } from "./react/react10.js";
import { react11 } from "./react/react11.js";
import { react12 } from "./react/react12.js";
import { react13 } from "./react/react13.js";
import { react14 } from "./react/react14.js";
import { react15 } from "./react/react15.js";
import { react16 } from "./react/react16.js";
import { react17 } from "./react/react17.js";

import { redux1 } from "./redux/redux1.js";
import { redux2 } from "./redux/redux2.js";
import { redux4 } from "./redux/redux4.js";
import { redux5 } from "./redux/redux5.js";
import { redux6 } from "./redux/redux6.js";
import { redux9 } from "./redux/redux9.js";
// redux8 намеренно не в реестре — см. комментарий в конце файла

import { ts2 } from "./ts/ts2.js";
import { ts3 } from "./ts/ts3.js";
import { ts4 } from "./ts/ts4.js";
import { ts6 } from "./ts/ts6.js";

import { css1 } from "./css/css1.js";
import { css2 } from "./css/css2.js";
import { css3 } from "./css/css3.js";
import { css4 } from "./css/css4.js";
import { css5 } from "./css/css5.js";
import { css6 } from "./css/css6.js";
import { css7 } from "./css/css7.js";

import { rui1 } from "./rui/rui1.js";
import { rui2 } from "./rui/rui2.js";
import { rui3 } from "./rui/rui3.js";
import { rui4 } from "./rui/rui4.js";
import { eb1 } from "./eb/eb1.js";
import { url1 } from "./url/url1.js";
import { url2 } from "./url/url2.js";

import { misc1 } from "./misc/misc1.js";
import { misc3 } from "./misc/misc3.js";
import { misc4 } from "./misc/misc4.js";
import { misc12 } from "./misc/misc12.js";
import { misc15 } from "./misc/misc15.js";
import { misc16 } from "./misc/misc16.js";
import { misc17 } from "./misc/misc17.js";
import { misc18 } from "./misc/misc18.js";
import { misc8 } from "./misc/misc8.js";
import { misc14 } from "./misc/misc14.js";

export const allRules: Rule[] = [
    ...corpusRules,
    fs1,
    fs2,
    fs4,
    fs5,
    fs6,
    fs7auto,
    fs8,
    fs12,
    fs13,
    fs14,
    fs15,
    mvvm1,
    mvvm2,
    mvvm4,
    mvvm5,
    mvvm7,
    mvvm9,
    mvvm10,
    mvvm11,
    react1,
    react2,
    react3,
    react4,
    react7,
    react8,
    react9,
    react10,
    react11,
    react12,
    react13,
    react14,
    react15,
    react16,
    react17,
    redux1,
    redux2,
    redux4,
    redux5,
    redux6,
    redux9,
    ts2,
    ts3,
    ts4,
    ts6,
    css1,
    css2,
    css3,
    css4,
    css5,
    css6,
    css7,
    rui1,
    rui2,
    rui3,
    rui4,
    eb1,
    url1,
    url2,
    misc1,
    misc3,
    misc4,
    misc8,
    misc12,
    misc15,
    misc16,
    misc17,
    misc18,
    misc14,
];

// REDUX-8 (пустые редьюсеры-заглушки) исключено из дефолтного набора: в createSlice reducers
// определяет набор доступных action creator'ов слайса — если fetchXSuccess не объявлен, экшен
// не существует и его нельзя задиспатчить, даже если он нужен другому коду (саге, вотчеру).
// "Пустой" reducer с точки зрения тела функции — не значит "не нужен". Отличить "заглушку про
// запас" от "реально лишнего" без анализа всех диспатчей этого экшена по кодовой базе нельзя,
// и как показала реальная проверка на branch historical-case, эвристика (пустое тело)
// давала стабильные ложные срабатывания. Правило (src/rules/redux/redux8.ts) и тест на него
// оставлены в репозитории, но не подключены — включай явно через собственный rules-список, если
// понадобится точечно.
