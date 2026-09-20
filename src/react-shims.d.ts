// 本项目不引入额外依赖（无 @types/react），以下为最小 JSX/React 声明，
// 仅用于让 TypeScript 严格模式通过；运行时仍由已安装的 react 提供。
declare namespace React {
  type ReactNode = unknown;

  interface Attributes {
    key?: string | number | null;
  }

  type ChangeEvent<T> = { target: T };
  type FormEvent = { preventDefault(): void };

  type FC<P> = (props: P) => JSX.Element;

  function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  function useMemo<T>(factory: () => T, deps: unknown[]): T;
  function useRef<T>(initial: T | null): { current: T | null };
  function createRoot(container: Element): { render(node: unknown): void };
  function StrictMode(props: { children?: ReactNode }): JSX.Element;
}

declare module "react" {
  export = React;
}

declare module "react/jsx-runtime" {
  export const jsx: unknown;
  export const jsxs: unknown;
  export const Fragment: unknown;
}

declare module "react-dom/client" {
  export function createRoot(container: Element): { render(node: unknown): void };
}

declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface ElementAttributesProperty {
    props: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }

  type LibraryManagedAttributes<C, P> = P;

  interface IntrinsicAttributes {
    key?: string | number | null;
  }

  interface HTMLAttributes {
    key?: string | number | null;
    id?: string;
    children?: React.ReactNode;
    className?: string;
    href?: string;
    placeholder?: string;
    value?: string | number;
    checked?: boolean;
    type?: string;
    title?: string;
    role?: string;
    lang?: string;
    min?: string;
    style?: Record<string, string | number>;
    list?: string;
    disabled?: boolean;
    "aria-label"?: string;
    onChange?: (e: React.ChangeEvent<{ value: string; checked: boolean }>) => void;
    onClick?: (e: React.ChangeEvent<unknown>) => void;
    ref?: unknown;
  }

  interface LabelAttributes extends HTMLAttributes {
    htmlFor?: string;
  }

  interface IntrinsicElements {
    main: HTMLAttributes;
    section: HTMLAttributes;
    aside: HTMLAttributes;
    article: HTMLAttributes;
    header: HTMLAttributes;
    footer: HTMLAttributes;
    div: HTMLAttributes;
    span: HTMLAttributes;
    em: HTMLAttributes;
    p: HTMLAttributes;
    h1: HTMLAttributes;
    h2: HTMLAttributes;
    h3: HTMLAttributes;
    small: HTMLAttributes;
    b: HTMLAttributes;
    i: HTMLAttributes;
    strong: HTMLAttributes;
    hr: HTMLAttributes;
    ul: HTMLAttributes;
    li: HTMLAttributes;
    button: HTMLAttributes;
    input: HTMLAttributes;
    select: HTMLAttributes;
    option: HTMLAttributes;
    label: LabelAttributes;
    datalist: HTMLAttributes;
    a: HTMLAttributes;
    html: LabelAttributes;
    head: HTMLAttributes;
    body: HTMLAttributes;
    title: HTMLAttributes;
    meta: HTMLAttributes;
    link: HTMLAttributes;
    script: HTMLAttributes;
  }
}
