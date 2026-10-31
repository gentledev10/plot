import { describe, expect, it } from 'vitest';
import { isWithinOrigin, resolveRendererFile } from './navigation';

describe('isWithinOrigin', () => {
  it('accepts the origin itself and paths under it', () => {
    expect(isWithinOrigin('app://plot', 'app://plot')).toBe(true);
    expect(isWithinOrigin('app://plot/index.html', 'app://plot')).toBe(true);
    expect(isWithinOrigin('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
  });

  it('rejects other origins, including look-alike prefixes', () => {
    expect(isWithinOrigin('https://github.com/', 'app://plot')).toBe(false);
    expect(isWithinOrigin('app://plot.evil/index.html', 'app://plot')).toBe(false);
    expect(isWithinOrigin('http://localhost:51730/', 'http://localhost:5173')).toBe(false);
  });
});

describe('resolveRendererFile', () => {
  const root = '/app/out/renderer';

  it('maps request paths to files inside the renderer directory', () => {
    expect(resolveRendererFile(root, 'app://plot/index.html')).toBe('/app/out/renderer/index.html');
    expect(resolveRendererFile(root, 'app://plot/assets/index-abc.js')).toBe(
      '/app/out/renderer/assets/index-abc.js',
    );
  });

  it('decodes percent-encoded names', () => {
    expect(resolveRendererFile(root, 'app://plot/assets/a%20b.css')).toBe(
      '/app/out/renderer/assets/a b.css',
    );
  });

  it('keeps dot segments that the URL parser already folded into the directory', () => {
    expect(resolveRendererFile(root, 'app://plot/%2e%2e/main/index.js')).toBe(
      '/app/out/renderer/main/index.js',
    );
  });

  it('refuses paths that escape the renderer directory once decoded', () => {
    expect(resolveRendererFile(root, 'app://plot/..%2F..%2Fsecret')).toBeUndefined();
    expect(
      resolveRendererFile(root, 'app://plot/assets/%2e%2e%2f%2e%2e%2fmain.js'),
    ).toBeUndefined();
  });

  it('refuses the directory itself and malformed URLs', () => {
    expect(resolveRendererFile(root, 'app://plot/')).toBeUndefined();
    expect(resolveRendererFile(root, 'app://plot/%E0%A4%A')).toBeUndefined();
  });
});
