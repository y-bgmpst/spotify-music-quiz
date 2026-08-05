declare module 'react' {
  export function useEffect(
    effect: () => void | (() => void),
    deps?: unknown[],
  ): void;
  export function useRef<T>(value: T): { current: T };
  export function useRef<T = undefined>(): { current: T | undefined };
  export function useState<T = undefined>(
    value?: T,
  ): [T, (value: T | undefined | ((previous: T) => T)) => void];
  export const StrictMode: any;
}
declare module 'react-dom/client' {
  export function createRoot(element: Element): {
    render(value: unknown): void;
  };
}
declare module 'react/jsx-runtime' {
  export const jsx: unknown;
  export const jsxs: unknown;
  export const Fragment: unknown;
}
declare namespace JSX {
  interface IntrinsicElements {
    [element: string]: Record<string, unknown>;
  }
}
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
