import Taro from "@tarojs/taro";

const BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://your-production-api.com";

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: Record<string, unknown>;
  needAuth?: boolean;
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, needAuth = false } = options;

  const header: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (needAuth) {
    const token = Taro.getStorageSync("access_token");
    if (token) {
      header["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    header,
  });

  return response.data as T;
}

export async function healthCheck(): Promise<{ status: string; service: string }> {
  return request({ url: "/health" });
}
