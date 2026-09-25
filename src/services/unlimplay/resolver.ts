import fs from "fs";
import path from "path";
import vm from "vm";
import * as cheerio from "cheerio";
import { externalFetch } from "@/lib/httpClient";

// Unpack function for Dean Edwards packer
function unpack(p: string, a: number, c: number, k: string[]): string {
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

export async function resolveUnlimplay(embedUrl: string): Promise<any> {
  console.log(`[Resolver] Resolving: ${embedUrl}`);
  
  // 1. Fetch embed page HTML
  const res = await externalFetch(embedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Referer": "https://unlimplay.com/"
    },
    proxy: "never"
  });
  
  if (!res.ok) {
    throw new Error(`Failed to load embed page: HTTP ${res.status}`);
  }
  
  const html = await res.text();
  const $ = cheerio.load(html);

  // 2. Extract AAencoded script
  let aaencodedCode = "";
  $("script").each((_, el) => {
    const text = $(el).text();
    if (text.includes("ﾟωﾟﾉ") || (text.includes("(ﾟДﾟ)") && text.includes("(ﾟoﾟ)"))) {
      aaencodedCode = text.trim();
      return false; // break
    }
  });

  if (!aaencodedCode) {
    if (html.includes("UnlimPlay API — Streaming Infrastructure") || html.includes("Not Found")) {
      console.warn(`[Unlimplay] Embed expired or landing page served: ${embedUrl}`);
    } else {
      console.warn(`[Unlimplay] Could not find AAencoded script in embed page: ${embedUrl}`);
    }
    return null;
  }

  // 3. Decode AAencoded script in VM
  const sandbox: any = {
    console: console,
    window: {},
    document: {
      createElement: () => ({ setAttribute: () => {} }),
      body: { appendChild: () => {} }
    }
  };
  sandbox.window = sandbox;

  const wrapperScript = `
    const originalFunction = Function;
    const myHook = function(...args) {
      if (args.length > 0) {
        const code = args[args.length - 1];
        if (typeof code === 'string' && code.length > 50) {
          globalThis.capturedCode = code;
        }
      }
      return new originalFunction(...args);
    };
    myHook.toString = () => "function Function() { [native code] }";
    Function.prototype.constructor = myHook;
  `;

  const context = vm.createContext(sandbox);
  vm.runInContext(wrapperScript, context);
  vm.runInContext(aaencodedCode, context);

  const capturedCode = (context as any).capturedCode;
  if (!capturedCode) {
    throw new Error("Failed to capture decoded AA code");
  }

  // Parse packer parameters from captured code
  const packerMatch = capturedCode.match(/}\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)\)\)/);
  if (!packerMatch) {
    throw new Error("Failed to match packer parameters");
  }

  const [, p, aStr, cStr, kStr] = packerMatch;
  const a = parseInt(aStr, 10);
  const c = parseInt(cStr, 10);
  const k = kStr.split('|');

  const unpackedVariables = unpack(p, a, c, k);

  // Extract variables using regex
  const pdMatch = unpackedVariables.match(/pd="([^"]+)"/);
  const psMatch = unpackedVariables.match(/ps="([^"]+)"/);
  const kakenMatch = unpackedVariables.match(/kaken="([^"]+)"/);

  if (!pdMatch || !psMatch || !kakenMatch) {
    throw new Error("Failed to extract pd, ps, or kaken from unpacked variables");
  }

  const pd = pdMatch[1];
  const ps = psMatch[1];
  const kaken = kakenMatch[1];

  // 4. Fetch the API configuration response
  const apiUrl = `https://unlimplay.com/api/?p=${encodeURIComponent(ps)}`;
  
  const apiRes = await externalFetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": embedUrl,
      "Origin": "https://unlimplay.com"
    },
    body: kaken,
    proxy: "never"
  });
  
  if (!apiRes.ok) {
    throw new Error(`API returned HTTP ${apiRes.status}`);
  }
  const encryptedText = await apiRes.text();

  // 5. Decrypt using CryptoJS and player script in VM
  const cryptoJsPath = path.join(process.cwd(), "src/services/unlimplay/crypto-js.js");
  const playerJsPath = path.join(process.cwd(), "src/services/unlimplay/player_script.js");
  
  const cryptoJsCode = fs.readFileSync(cryptoJsPath, 'utf8');
  const playerJsCode = fs.readFileSync(playerJsPath, 'utf8');

  // Setup sandbox with player mocks
  const dummyElement = {
    on: () => {}, ready: () => {}, hide: () => {}, show: () => {},
    addClass: () => {}, removeClass: () => {}, html: () => "", text: () => "",
    val: () => "", append: () => {}, find: () => ({ length: 0 }), attr: () => ""
  };
  const makePromise = () => {
    const promise = { done: () => promise, fail: () => promise, always: () => promise };
    return promise;
  };
  const dummyJQuery = new Proxy(function() { return dummyElement; }, {
    get: (target, prop) => prop === 'ajax' ? () => makePromise() : () => makePromise()
  });
  const dummyDOMElement = {
    style: {}, classList: { add: () => {}, remove: () => {} },
    innerText: "", textContent: "", value: "", getAttribute: () => "",
    setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {}
  };
  const customAtob = (str: any) => {
    if (typeof str !== 'string') return '';
    const cleanStr = str.replace(/[\s\t\r\n]/g, '');
    try { return Buffer.from(cleanStr, 'base64').toString('latin1'); } catch (e) { return ''; }
  };
  const customBtoa = (str: any) => {
    if (typeof str !== 'string') return '';
    try { return Buffer.from(str, 'latin1').toString('base64'); } catch (e) { return ''; }
  };

  const decryptSandbox = {
    console: console,
    atob: customAtob,
    btoa: customBtoa,
    pd: pd, // Fresh pd variable
    $: dummyJQuery,
    jQuery: dummyJQuery,
    document: {
      addEventListener: () => {}, querySelector: () => dummyDOMElement,
      querySelectorAll: () => [], getElementById: () => dummyDOMElement,
      createElement: () => dummyDOMElement, body: dummyDOMElement
    },
    navigator: { userAgent: "Mozilla/5.0" },
    location: { href: embedUrl, hostname: "unlimplay.com" },
    setInterval: () => {}, setTimeout: () => {}
  };

  const windowProxy = new Proxy(decryptSandbox, {
    get: (target: any, prop: any) => {
      if (prop === 'window') return windowProxy;
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop in globalThis) return (globalThis as any)[prop];
      return () => {};
    },
    set: (target: any, prop: any, value: any) => {
      target[prop] = value;
      return true;
    }
  });
  (decryptSandbox as any).window = windowProxy;

  const decryptContext = vm.createContext(windowProxy);
  vm.runInContext(cryptoJsCode, decryptContext);
  vm.runInContext(playerJsCode, decryptContext);

  // If the API returned a cleartext JSON response (e.g., status: fail or Not Found)
  if (encryptedText.trim().startsWith('{')) {
    const parsed = JSON.parse(encryptedText);
    if (parsed.status === "fail" || !parsed.success) {
      throw new Error(parsed.message || "Contenido no disponible en Unlimplay.");
    }
    return parsed;
  }

  (windowProxy as any).encryptedText = encryptedText;
  const decrypted = vm.runInContext(`dcx(encryptedText)`, decryptContext);
  return JSON.parse(decrypted);
}

export async function discoverUnlimplayAlternates(embedUrl: string): Promise<string[]> {
  const candidates = new Set<string>([embedUrl]);

  try {
    const res = await externalFetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://unlimplay.com/",
      },
      proxy: "never",
      timeoutMs: 15000,
    });
    if (!res.ok) return [...candidates];

    const html = await res.text();
    const $ = cheerio.load(html);
    $("[data-url*='unlimplay.com/embed/']").each((_, el) => {
      const value = $(el).attr("data-url")?.trim();
      if (value) candidates.add(value);
    });

    for (const match of html.matchAll(/https?:\/\/unlimplay\.com\/embed\/[^\s'"<>]+?\?alt=[^'"<>\s]+/g)) {
      candidates.add(match[0].replace(/\\/g, ""));
    }
  } catch {
    // Keep the original embed URL as the fallback candidate.
  }

  return [...candidates];
}
