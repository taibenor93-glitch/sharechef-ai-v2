// TEST-123

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateRecipe } from "../api/recipe";
import { validateIngredients } from "../lib/honestRules";
import { speak } from "../voice/tts";
const localeNameMap: Record<string, string> = {};

  english: "en",
  hebrew: "he",
  arabic: "ar",
  hindi: "hi",
  japanese: "ja",
  chinese: "zh-CN",
  spanish: "es",
  french: "fr",
  italian: "it",
  portuguese: "pt",
  german: "de",
  korean: "ko",
  russian: "ru",
  turkish: "tr",
  dutch: "nl",
  swedish: "sv",
  norwegian: "no",
  finnish: "fi",
  danish: "da",
};
