export default {
  routes: [
    {
      method: 'GET',
      path: '/blogs/slug/:slug',
      handler: 'blog.findBySlug',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/blogs/findBySlug/:slug',
      handler: 'blog.findBySlug',
      config: {
        auth: false,
      },
    },
  ],
};
