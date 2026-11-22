import type { SVGProps } from "react";
import logoSource from "@/assets/brand/nyacatch.svg?raw";
import pawSource from "@/assets/brand/paw.svg?raw";
import checkSource from "@/assets/brand/check.svg?raw";
import "./brand-marks.css";

// Only these build-time local imports reach innerHTML. Never accept SVG markup
// from props, URLs or user content; the asset files remain the only path source.
function localSvg(source: string) {
  const match = source
    .trim()
    .match(/^<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>$/);
  if (!match) throw new Error("Invalid local brand SVG");
  return { viewBox: match[1], markup: { __html: match[2] } };
}

const logo = localSvg(logoSource);
const paw = localSvg(pawSource);
const check = localSvg(checkSource);

export function BrandLogo({
  className = "",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={32}
      height={32}
      aria-hidden="true"
      focusable="false"
      {...props}
      className={`nc-brand-logo ${className}`.trim()}
      viewBox={logo.viewBox}
      children={undefined}
      dangerouslySetInnerHTML={logo.markup}
    />
  );
}

export function BrandPaw({
  className = "",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      aria-hidden="true"
      focusable="false"
      {...props}
      className={`nc-brand-paw ${className}`.trim()}
      viewBox={paw.viewBox}
      children={undefined}
      dangerouslySetInnerHTML={paw.markup}
    />
  );
}

/** Static by default; the caller can opt into a draw with data-draw="true". */
export function BrandCheck({
  className = "",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      aria-hidden="true"
      focusable="false"
      {...props}
      className={`nc-brand-check ${className}`.trim()}
      viewBox={check.viewBox}
      children={undefined}
      dangerouslySetInnerHTML={check.markup}
    />
  );
}
