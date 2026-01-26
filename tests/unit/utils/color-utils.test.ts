import { describe, it, expect } from 'vitest';
import {
  // Parsing
  parseHex,
  parseHex8,
  parseRgb,
  parseHsl,
  parseColor,
  // Conversion
  rgbToHex,
  rgbaToHex8,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  // Formatting
  formatRgb,
  formatRgba,
  formatHsl,
  formatHsla,
  formatColor,
  // Manipulation
  lighten,
  darken,
  saturate,
  desaturate,
  adjustHue,
  invert,
  grayscale,
  complement,
  setAlpha,
  mix,
  blend,
  // Accessibility
  getLuminance,
  getContrastRatio,
  meetsContrastAA,
  meetsContrastAAA,
  getContrastLevel,
  isLight,
  isDark,
  getContrastingTextColor,
  findAccessibleColor,
  // Color Schemes
  analogous,
  triadic,
  tetradic,
  splitComplementary,
  monochromatic,
  shades,
  tints,
  // Named Colors
  getNamedColor,
  isNamedColor,
  getNamedColorNames,
  // Utilities
  colorsEqual,
  colorDistance,
  randomColor,
  randomPastel,
  clampRgb,
  RGB,
  RGBA,
} from '@shared/utils/color-utils';

describe('Color Parsing', () => {
  describe('parseHex', () => {
    it('should parse 6-digit hex', () => {
      expect(parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseHex('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(parseHex('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
      expect(parseHex('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should parse 3-digit hex', () => {
      expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseHex('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
      expect(parseHex('#00f')).toEqual({ r: 0, g: 0, b: 255 });
      expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should parse without hash', () => {
      expect(parseHex('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseHex('f00')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return null for invalid hex', () => {
      expect(parseHex('#gg0000')).toBeNull();
      expect(parseHex('#ff00')).toBeNull();
      expect(parseHex('invalid')).toBeNull();
    });
  });

  describe('parseHex8', () => {
    it('should parse 8-digit hex with alpha', () => {
      expect(parseHex8('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
      expect(parseHex8('#ff0000ff')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseHex8('#ff000000')).toEqual({ r: 255, g: 0, b: 0, a: 0 });
    });

    it('should parse 4-digit hex with alpha', () => {
      expect(parseHex8('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
    });

    it('should fall back to regular hex', () => {
      expect(parseHex8('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });
  });

  describe('parseRgb', () => {
    it('should parse rgb()', () => {
      expect(parseRgb('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseRgb('rgb(0, 255, 0)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    it('should parse rgba()', () => {
      expect(parseRgb('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
      expect(parseRgb('rgba(0, 0, 255, 1)')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    });

    it('should clamp values', () => {
      const result = parseRgb('rgb(300, -10, 128)');
      expect(result?.r).toBe(255);
      expect(result?.g).toBe(0);
    });

    it('should return null for invalid', () => {
      expect(parseRgb('invalid')).toBeNull();
      expect(parseRgb('hsl(0, 100%, 50%)')).toBeNull();
    });
  });

  describe('parseHsl', () => {
    it('should parse hsl()', () => {
      expect(parseHsl('hsl(0, 100%, 50%)')).toEqual({ h: 0, s: 100, l: 50, a: 1 });
      expect(parseHsl('hsl(120, 50%, 75%)')).toEqual({ h: 120, s: 50, l: 75, a: 1 });
    });

    it('should parse hsla()', () => {
      expect(parseHsl('hsla(240, 100%, 50%, 0.5)')).toEqual({ h: 240, s: 100, l: 50, a: 0.5 });
    });

    it('should return null for invalid', () => {
      expect(parseHsl('invalid')).toBeNull();
    });
  });

  describe('parseColor', () => {
    it('should parse hex colors', () => {
      expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it('should parse rgb colors', () => {
      expect(parseColor('rgb(0, 255, 0)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    });

    it('should parse hsl colors', () => {
      const result = parseColor('hsl(240, 100%, 50%)');
      expect(result?.r).toBe(0);
      expect(result?.g).toBe(0);
      expect(result?.b).toBe(255);
    });

    it('should parse named colors', () => {
      expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor('blue')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(parseColor('WHITE')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('should return null for invalid', () => {
      expect(parseColor('notacolor')).toBeNull();
    });
  });
});

describe('Color Conversion', () => {
  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe('#0000ff');
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
      expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    });
  });

  describe('rgbaToHex8', () => {
    it('should convert RGBA to hex8', () => {
      expect(rgbaToHex8({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000ff');
      expect(rgbaToHex8({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('#ff000080');
      expect(rgbaToHex8({ r: 255, g: 0, b: 0, a: 0 })).toBe('#ff000000');
    });
  });

  describe('rgbToHsl / hslToRgb', () => {
    it('should convert RGB to HSL', () => {
      expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
      expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50 });
      expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
    });

    it('should convert HSL to RGB', () => {
      expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
      expect(hslToRgb({ h: 120, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0 });
      expect(hslToRgb({ h: 240, s: 100, l: 50 })).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('should handle grayscale', () => {
      const gray = rgbToHsl({ r: 128, g: 128, b: 128 });
      expect(gray.s).toBe(0);
      expect(hslToRgb({ h: 0, s: 0, l: 50 })).toEqual({ r: 128, g: 128, b: 128 });
    });

    it('should be reversible', () => {
      const original = { r: 100, g: 150, b: 200 };
      const hsl = rgbToHsl(original);
      const back = hslToRgb(hsl);
      // Allow +/- 1 difference due to rounding in HSL conversion
      expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
    });
  });

  describe('rgbToHsv / hsvToRgb', () => {
    it('should convert RGB to HSV', () => {
      expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
      expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, v: 100 });
    });

    it('should convert HSV to RGB', () => {
      expect(hsvToRgb({ h: 0, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
      expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 });
    });
  });
});

describe('Color Formatting', () => {
  describe('formatRgb', () => {
    it('should format as rgb()', () => {
      expect(formatRgb({ r: 255, g: 0, b: 0 })).toBe('rgb(255, 0, 0)');
    });
  });

  describe('formatRgba', () => {
    it('should format as rgba()', () => {
      expect(formatRgba({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    });
  });

  describe('formatHsl', () => {
    it('should format as hsl()', () => {
      expect(formatHsl({ h: 0, s: 100, l: 50 })).toBe('hsl(0, 100%, 50%)');
    });
  });

  describe('formatHsla', () => {
    it('should format as hsla()', () => {
      expect(formatHsla({ h: 0, s: 100, l: 50, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)');
    });
  });

  describe('formatColor', () => {
    const red: RGBA = { r: 255, g: 0, b: 0, a: 0.5 };

    it('should format in different formats', () => {
      expect(formatColor(red, 'hex')).toBe('#ff0000');
      expect(formatColor(red, 'hex8')).toBe('#ff000080');
      expect(formatColor(red, 'rgb')).toBe('rgb(255, 0, 0)');
      expect(formatColor(red, 'rgba')).toBe('rgba(255, 0, 0, 0.5)');
      expect(formatColor(red, 'hsl')).toBe('hsl(0, 100%, 50%)');
      expect(formatColor(red, 'hsla')).toBe('hsla(0, 100%, 50%, 0.5)');
    });
  });
});

describe('Color Manipulation', () => {
  const red: RGB = { r: 255, g: 0, b: 0 };

  describe('lighten', () => {
    it('should lighten color', () => {
      const lightened = lighten(red, 25);
      const hsl = rgbToHsl(lightened);
      expect(hsl.l).toBeGreaterThan(50);
    });
  });

  describe('darken', () => {
    it('should darken color', () => {
      const darkened = darken(red, 25);
      const hsl = rgbToHsl(darkened);
      expect(hsl.l).toBeLessThan(50);
    });
  });

  describe('saturate', () => {
    it('should increase saturation', () => {
      const gray = { r: 128, g: 64, b: 64 };
      const saturated = saturate(gray, 20);
      const hsl = rgbToHsl(saturated);
      expect(hsl.s).toBeGreaterThan(rgbToHsl(gray).s);
    });
  });

  describe('desaturate', () => {
    it('should decrease saturation', () => {
      const desaturated = desaturate(red, 50);
      const hsl = rgbToHsl(desaturated);
      expect(hsl.s).toBeLessThan(100);
    });
  });

  describe('adjustHue', () => {
    it('should adjust hue', () => {
      const adjusted = adjustHue(red, 120);
      const hsl = rgbToHsl(adjusted);
      expect(hsl.h).toBe(120);
    });

    it('should wrap around', () => {
      const adjusted = adjustHue(red, -60);
      const hsl = rgbToHsl(adjusted);
      expect(hsl.h).toBe(300);
    });
  });

  describe('invert', () => {
    it('should invert color', () => {
      expect(invert(red)).toEqual({ r: 0, g: 255, b: 255 });
      expect(invert({ r: 0, g: 0, b: 0 })).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('grayscale', () => {
    it('should convert to grayscale', () => {
      const gray = grayscale(red);
      expect(gray.r).toBe(gray.g);
      expect(gray.g).toBe(gray.b);
    });
  });

  describe('complement', () => {
    it('should get complement color', () => {
      const comp = complement(red);
      const hsl = rgbToHsl(comp);
      expect(hsl.h).toBe(180); // Cyan is complement of red
    });
  });

  describe('setAlpha', () => {
    it('should set alpha value', () => {
      expect(setAlpha(red, 0.5)).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    });

    it('should clamp alpha', () => {
      expect(setAlpha(red, 1.5).a).toBe(1);
      expect(setAlpha(red, -0.5).a).toBe(0);
    });
  });

  describe('mix', () => {
    it('should mix two colors', () => {
      const white: RGB = { r: 255, g: 255, b: 255 };
      const black: RGB = { r: 0, g: 0, b: 0 };
      const mixed = mix(white, black, 0.5);
      expect(mixed.r).toBe(128);
      expect(mixed.g).toBe(128);
      expect(mixed.b).toBe(128);
    });

    it('should respect weight', () => {
      const white: RGB = { r: 255, g: 255, b: 255 };
      const black: RGB = { r: 0, g: 0, b: 0 };
      expect(mix(white, black, 0)).toEqual(white);
      expect(mix(white, black, 1)).toEqual(black);
    });
  });

  describe('blend', () => {
    it('should blend foreground over background', () => {
      const bg: RGB = { r: 255, g: 255, b: 255 };
      const fg: RGBA = { r: 0, g: 0, b: 0, a: 0.5 };
      const blended = blend(bg, fg);
      expect(blended.r).toBe(128);
      expect(blended.g).toBe(128);
      expect(blended.b).toBe(128);
    });
  });
});

describe('Accessibility', () => {
  const white: RGB = { r: 255, g: 255, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };
  const red: RGB = { r: 255, g: 0, b: 0 };

  describe('getLuminance', () => {
    it('should calculate luminance', () => {
      expect(getLuminance(white)).toBeCloseTo(1, 2);
      expect(getLuminance(black)).toBeCloseTo(0, 2);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate contrast ratio', () => {
      expect(getContrastRatio(white, black)).toBeCloseTo(21, 0);
      expect(getContrastRatio(white, white)).toBeCloseTo(1, 0);
    });
  });

  describe('meetsContrastAA', () => {
    it('should check AA compliance', () => {
      expect(meetsContrastAA(black, white)).toBe(true);
      expect(meetsContrastAA(white, white)).toBe(false);
    });

    it('should have lower threshold for large text', () => {
      const gray = { r: 128, g: 128, b: 128 };
      expect(meetsContrastAA(gray, white, true)).toBe(true);
    });
  });

  describe('meetsContrastAAA', () => {
    it('should check AAA compliance', () => {
      expect(meetsContrastAAA(black, white)).toBe(true);
    });
  });

  describe('getContrastLevel', () => {
    it('should return contrast level', () => {
      expect(getContrastLevel(black, white)).toBe('AAA');
      expect(getContrastLevel(white, white)).toBe('FAIL');
    });
  });

  describe('isLight / isDark', () => {
    it('should determine light/dark', () => {
      expect(isLight(white)).toBe(true);
      expect(isLight(black)).toBe(false);
      expect(isDark(black)).toBe(true);
      expect(isDark(white)).toBe(false);
    });
  });

  describe('getContrastingTextColor', () => {
    it('should return black for light backgrounds', () => {
      expect(getContrastingTextColor(white)).toEqual(black);
    });

    it('should return white for dark backgrounds', () => {
      expect(getContrastingTextColor(black)).toEqual(white);
    });
  });

  describe('findAccessibleColor', () => {
    it('should return original if already accessible', () => {
      const result = findAccessibleColor(black, white);
      expect(meetsContrastAA(result, white)).toBe(true);
    });

    it('should adjust color for accessibility', () => {
      const lowContrast = { r: 200, g: 200, b: 200 };
      const result = findAccessibleColor(lowContrast, white);
      expect(meetsContrastAA(result, white)).toBe(true);
    });
  });
});

describe('Color Schemes', () => {
  const red: RGB = { r: 255, g: 0, b: 0 };

  describe('analogous', () => {
    it('should generate analogous colors', () => {
      const colors = analogous(red, 3);
      expect(colors).toHaveLength(3);
    });
  });

  describe('triadic', () => {
    it('should generate triadic colors', () => {
      const [c1, c2, c3] = triadic(red);
      const h1 = rgbToHsl(c1).h;
      const h2 = rgbToHsl(c2).h;
      const h3 = rgbToHsl(c3).h;
      expect(h2).toBeCloseTo((h1 + 120) % 360, 0);
      expect(h3).toBeCloseTo((h1 + 240) % 360, 0);
    });
  });

  describe('tetradic', () => {
    it('should generate tetradic colors', () => {
      const colors = tetradic(red);
      expect(colors).toHaveLength(4);
    });
  });

  describe('splitComplementary', () => {
    it('should generate split-complementary colors', () => {
      const colors = splitComplementary(red);
      expect(colors).toHaveLength(3);
    });
  });

  describe('monochromatic', () => {
    it('should generate monochromatic palette', () => {
      const colors = monochromatic(red, 5);
      expect(colors).toHaveLength(5);
      // All should have same hue
      const hues = colors.map((c) => rgbToHsl(c).h);
      hues.forEach((h) => expect(h).toBe(hues[0]));
    });
  });

  describe('shades', () => {
    it('should generate shades (darker)', () => {
      const shadesArr = shades(red, 3);
      expect(shadesArr).toHaveLength(3);
      const lightness = shadesArr.map((c) => rgbToHsl(c).l);
      expect(lightness[0]).toBeGreaterThan(lightness[1]);
    });
  });

  describe('tints', () => {
    it('should generate tints (lighter)', () => {
      const tintsArr = tints(red, 3);
      expect(tintsArr).toHaveLength(3);
      const lightness = tintsArr.map((c) => rgbToHsl(c).l);
      expect(lightness[1]).toBeGreaterThan(lightness[0]);
    });
  });
});

describe('Named Colors', () => {
  describe('getNamedColor', () => {
    it('should return hex for named colors', () => {
      expect(getNamedColor('red')).toBe('#ff0000');
      expect(getNamedColor('blue')).toBe('#0000ff');
      expect(getNamedColor('transparent')).toBe('#00000000');
    });

    it('should be case insensitive', () => {
      expect(getNamedColor('RED')).toBe('#ff0000');
      expect(getNamedColor('Red')).toBe('#ff0000');
    });

    it('should return null for unknown', () => {
      expect(getNamedColor('notacolor')).toBeNull();
    });
  });

  describe('isNamedColor', () => {
    it('should check if named color exists', () => {
      expect(isNamedColor('red')).toBe(true);
      expect(isNamedColor('notacolor')).toBe(false);
    });
  });

  describe('getNamedColorNames', () => {
    it('should return all color names', () => {
      const names = getNamedColorNames();
      expect(names).toContain('red');
      expect(names).toContain('blue');
      expect(names).toContain('transparent');
      expect(names.length).toBeGreaterThan(100);
    });
  });
});

describe('Utility Functions', () => {
  describe('colorsEqual', () => {
    it('should check color equality', () => {
      expect(colorsEqual({ r: 255, g: 0, b: 0 }, { r: 255, g: 0, b: 0 })).toBe(true);
      expect(colorsEqual({ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 })).toBe(false);
    });
  });

  describe('colorDistance', () => {
    it('should calculate distance', () => {
      const red = { r: 255, g: 0, b: 0 };
      const blue = { r: 0, g: 0, b: 255 };
      expect(colorDistance(red, red)).toBe(0);
      expect(colorDistance(red, blue)).toBeGreaterThan(0);
    });
  });

  describe('randomColor', () => {
    it('should generate valid random color', () => {
      const color = randomColor();
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(255);
      expect(color.g).toBeGreaterThanOrEqual(0);
      expect(color.g).toBeLessThanOrEqual(255);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(255);
    });
  });

  describe('randomPastel', () => {
    it('should generate pastel color (light)', () => {
      const color = randomPastel();
      expect(color.r).toBeGreaterThanOrEqual(127);
      expect(color.g).toBeGreaterThanOrEqual(127);
      expect(color.b).toBeGreaterThanOrEqual(127);
    });
  });

  describe('clampRgb', () => {
    it('should clamp values to valid range', () => {
      expect(clampRgb({ r: 300, g: -10, b: 128 })).toEqual({ r: 255, g: 0, b: 128 });
    });

    it('should round values', () => {
      expect(clampRgb({ r: 127.6, g: 127.4, b: 127.5 })).toEqual({ r: 128, g: 127, b: 128 });
    });
  });
});
