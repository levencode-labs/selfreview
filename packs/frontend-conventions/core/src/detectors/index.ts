import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { Finding } from "../types.js";

import { detectTs2 } from "./ts2.js";
import { detectTs3 } from "./ts3.js";
import { detectTs4 } from "./ts4.js";
import { detectTs6 } from "./ts6.js";

import { detectReact1 } from "./react1.js";
import { detectReact2 } from "./react2.js";
import { detectReact3 } from "./react3.js";
import { detectReact4 } from "./react4.js";
import { detectReact7 } from "./react7.js";
import { detectReact8 } from "./react8.js";
import { detectReact9 } from "./react9.js";
import { detectReact10 } from "./react10.js";
import { detectReact11 } from "./react11.js";
import { detectReact12 } from "./react12.js";
import { detectReact13 } from "./react13.js";
import { detectReact14 } from "./react14.js";
import { detectReact15 } from "./react15.js";
import { detectReact16 } from "./react16.js";
import { detectReact17 } from "./react17.js";

import { detectRedux1 } from "./redux1.js";
import { detectRedux2 } from "./redux2.js";
import { detectRedux4 } from "./redux4.js";
import { detectRedux5 } from "./redux5.js";
import { detectRedux6 } from "./redux6.js";
import { detectRedux9 } from "./redux9.js";

import { detectMvvm1 } from "./mvvm1.js";
import { detectMvvm2 } from "./mvvm2.js";
import { detectMvvm4 } from "./mvvm4.js";
import { detectMvvm5 } from "./mvvm5.js";
import { detectMvvm7, detectMvvm7BuildReducer, detectMvvm7ManualRootReducer } from "./mvvm7.js";
import { detectMvvm9 } from "./mvvm9.js";
import { detectMvvm10CreateSelector } from "./mvvm10.js";
import { detectMvvm11 } from "./mvvm11.js";

import { detectRui1 } from "./rui1.js";
import { detectRui2 } from "./rui2.js";
import { detectRui3 } from "./rui3.js";
import { detectRui4 } from "./rui4.js";
import { detectEb1 } from "./eb1.js";
import { detectUrl1 } from "./url1.js";
import { detectUrl2 } from "./url2.js";

import { detectFs1 } from "./fs1.js";
import { detectFs2 } from "./fs2.js";
import { detectFs4 } from "./fs4.js";
import { detectFs5 } from "./fs5.js";
import { detectFs6 } from "./fs6.js";
import { detectFs7 } from "./fs7.js";
import { detectFs8 } from "./fs8.js";
import { detectFs12 } from "./fs12.js";
import { detectFs13 } from "./fs13.js";
import { detectFs14 } from "./fs14.js";
import { detectFs15 } from "./fs15.js";

import { detectMisc1 } from "./misc1.js";
import { detectMisc3 } from "./misc3.js";
import { detectMisc4 } from "./misc4.js";
import { detectMisc12 } from "./misc12.js";
import { detectMisc15 } from "./misc15.js";
import { detectMisc16 } from "./misc16.js";
import { detectMisc17 } from "./misc17.js";
import { detectMisc18 } from "./misc18.js";

import { detectCss1 } from "./css1.js";
import { detectCss2 } from "./css2.js";
import { detectCss3 } from "./css3.js";
import { detectCss4 } from "./css4.js";
import { detectCss5 } from "./css5.js";
import { detectCss6 } from "./css6.js";
import { detectCss7 } from "./css7.js";

import { corpusRulePaths, detectCss8, detectCss9, detectReact18, detectReact19, detectRedux10, detectRedux11, detectMisc19, detectRui5, detectFs16 } from "./corpusConventions.js";
import type { DetectorState } from "./helpers.js";

export type { DetectorState } from "./helpers.js";

/**
 * Общий детектор: единый источник истины для auditor и ESLint. Чистый по сигнатуре —
 * (program, sourceText, filePath, state?) — 4-й аргумент несёт вне-AST контекст
 * (isNew/isDeleted/repoRoot/addedLines), который auditor знает из diff, а ESLint из git.
 */
export type Detector = (
    program: TSESTree.Program | null,
    sourceText: string,
    filePath: string,
    state?: DetectorState,
) => Finding[];

export { findCreateSliceReducersObjects } from "./redux6.js";
export { corpusRulePaths };

export {
    detectTs2,
    detectTs3,
    detectTs4,
    detectTs6,
    detectReact1,
    detectReact2,
    detectReact3,
    detectReact4,
    detectReact7,
    detectReact8,
    detectReact9,
    detectReact10,
    detectReact11,
    detectReact12,
    detectReact13,
    detectReact14,
    detectReact15,
    detectReact16,
    detectReact17,
    detectRedux1,
    detectRedux2,
    detectRedux4,
    detectRedux5,
    detectRedux6,
    detectRedux9,
    detectMvvm1,
    detectMvvm2,
    detectMvvm4,
    detectMvvm5,
    detectMvvm7,
    detectMvvm7BuildReducer,
    detectMvvm7ManualRootReducer,
    detectMvvm9,
    detectMvvm10CreateSelector,
    detectMvvm11,
    detectRui1,
    detectRui2,
    detectRui3,
    detectRui4,
    detectEb1,
    detectUrl1,
    detectUrl2,
    detectFs1,
    detectFs2,
    detectFs4,
    detectFs5,
    detectFs6,
    detectFs7,
    detectFs8,
    detectFs12,
    detectFs13,
    detectFs14,
    detectFs15,
    detectMisc1,
    detectMisc3,
    detectMisc4,
    detectMisc12,
    detectMisc15,
    detectMisc16,
    detectMisc17,
    detectMisc18,
    detectCss1,
    detectCss2,
    detectCss3,
    detectCss4,
    detectCss5,
    detectCss6,
    detectCss7,
};

/**
 * ruleId -> детектор для ESLint-адаптера. Заведены ВСЕ правила, у которых есть per-file
 * (или path/file/SCSS) содержимое, выразимое через (program, sourceText, filePath, state?).
 * Остались auditor-only: MISC-8 (статистика диффа), MISC-14 (добавленные строки).
 */
export const detectorsByRuleId: Record<string, Detector> = {
    "TS-2": detectTs2,
    "TS-3": detectTs3,
    "TS-4": detectTs4,
    "TS-6": detectTs6,

    "REACT-1": detectReact1,
    "REACT-2": detectReact2,
    "REACT-3": detectReact3,
    "REACT-4": detectReact4,
    "REACT-7": detectReact7,
    "REACT-8": detectReact8,
    "REACT-9": detectReact9,
    "REACT-10": detectReact10,
    "REACT-11": detectReact11,
    "REACT-12": detectReact12,
    "REACT-13": detectReact13,
    "REACT-14": detectReact14,
    "REACT-15": detectReact15,
    "REACT-16": detectReact16,
    "REACT-17": detectReact17,
    "CSS-8": detectCss8,
    "CSS-9": detectCss9,
    "REACT-18": detectReact18,
    "REACT-19": detectReact19,
    "REDUX-10": detectRedux10,
    "REDUX-11": detectRedux11,
    "MISC-19": detectMisc19,
    "RUI-5": detectRui5,
    "FS-16": detectFs16,

    "REDUX-1": detectRedux1,
    "REDUX-2": detectRedux2,
    "REDUX-4": detectRedux4,
    "REDUX-5": detectRedux5,
    "REDUX-6": detectRedux6,
    "REDUX-9": detectRedux9,

    "MVVM-1": detectMvvm1,
    "MVVM-2": detectMvvm2,
    "MVVM-4": detectMvvm4,
    "MVVM-5": detectMvvm5,
    "MVVM-7": detectMvvm7,
    "MVVM-9": detectMvvm9,
    "MVVM-10": detectMvvm10CreateSelector,
    "MVVM-11": detectMvvm11,

    "RUI-1": detectRui1,
    "RUI-2": detectRui2,
    "RUI-3": detectRui3,
    "RUI-4": detectRui4,
    "EB-1": detectEb1,
    "URL-1": detectUrl1,
    "URL-2": detectUrl2,

    "FS-1": detectFs1,
    "FS-2": detectFs2,
    "FS-4": detectFs4,
    "FS-5": detectFs5,
    "FS-6": detectFs6,
    "FS-7": detectFs7,
    "FS-8": detectFs8,
    "FS-12": detectFs12,
    "FS-13": detectFs13,
    "FS-14": detectFs14,
    "FS-15": detectFs15,

    "MISC-1": detectMisc1,
    "MISC-3": detectMisc3,
    "MISC-4": detectMisc4,
    "MISC-12": detectMisc12,
    "MISC-15": detectMisc15,
    "MISC-16": detectMisc16,
    "MISC-17": detectMisc17,
    "MISC-18": detectMisc18,

    "CSS-1": detectCss1,
    "CSS-2": detectCss2,
    "CSS-3": detectCss3,
    "CSS-4": detectCss4,
    "CSS-5": detectCss5,
    "CSS-6": detectCss6,
    "CSS-7": detectCss7,
};
