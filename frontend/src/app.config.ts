export default defineAppConfig({
  pages: [
    "pages/calendar/index",
    "pages/event/create",
    "pages/event/detail",
    "pages/index/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#fff",
    navigationBarTitleText: "共享日程",
    navigationBarTextStyle: "black",
  },
});
