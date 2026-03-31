from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, system_prompt: str, user_message: str) -> str:
        ...
