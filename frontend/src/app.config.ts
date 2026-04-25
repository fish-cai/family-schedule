export default defineAppConfig({
  pages: [
    "pages/calendar/index",
    "pages/group/index",
    "pages/group/create",
    "pages/group/detail",
    "pages/profile/index",
    "pages/event/create",
    "pages/event/detail",
    "pages/index/index",
    "pages/legal/privacy",
    "pages/legal/agreement",
  ],
  tabBar: {
    color: "#AAAAAA",
    selectedColor: "#4A6CFA",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/calendar/index",
        text: "日历",
        iconPath: "assets/tab-calendar.png",
        selectedIconPath: "assets/tab-calendar-active.png",
      },
      {
        pagePath: "pages/group/index",
        text: "日历组",
        iconPath: "assets/tab-group.png",
        selectedIconPath: "assets/tab-group-active.png",
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
        iconPath: "assets/tab-profile.png",
        selectedIconPath: "assets/tab-profile-active.png",
      },
    ],
  },
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#4A6CFA",
    navigationBarTitleText: "共享日程",
    navigationBarTextStyle: "white",
  },
  lazyCodeLoading: "requiredComponents",
});
