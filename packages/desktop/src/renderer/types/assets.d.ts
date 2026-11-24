/**
 * 渲染层静态资源的模块声明，Vite 构建把图片导入解析为带内容哈希的地址
 */
declare module '*.webp' {
  const url: string;
  export default url;
}
