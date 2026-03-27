export interface User {
  id: string;
  nickname: string;
  avatar: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}
