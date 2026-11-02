/** Sürüm numarası package.json'dan (Vite define) gelir; testlerde tanımsızsa "0". */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0';
