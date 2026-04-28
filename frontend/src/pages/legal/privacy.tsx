import { View, Text } from "@tarojs/components";
import "./legal.scss";

export default function PrivacyPage() {
  return (
    <View className="legal-page">
      <Text className="legal-title">隐私政策</Text>
      <Text className="legal-update">更新日期：2026 年 4 月 25 日</Text>

      <Text className="legal-intro">
        感谢您使用「共享日程」（以下简称"我们"或"本小程序"）。我们非常重视您的个人信息和隐私保护。本隐私政策将帮助您了解我们如何收集、使用、存储和保护您的信息。
      </Text>

      <Text className="legal-h">一、我们收集的信息</Text>
      <Text className="legal-p">
        1. 微信账号信息：当您首次进入小程序时，我们会通过微信授权获取您的微信 OpenID（一个仅在我们小程序内有效的唯一标识符）、微信昵称和头像，用于建立账号体系。
      </Text>
      <Text className="legal-p">
        2. 您主动提供的内容：包括您创建的日程标题、描述、时间、地点、提醒设置、日历组名称、邀请码等。这些内容由您主动输入并保存。
      </Text>
      <Text className="legal-p">
        3. 自然语言输入：当您使用快速创建日程功能时，您输入的文字会被发送至第三方解析服务以解析为结构化日程信息。
      </Text>

      <Text className="legal-h">二、我们如何使用信息</Text>
      <Text className="legal-p">
        1. 提供核心功能：包括日程创建、查看、编辑、删除，日历组创建、加入、共享。
      </Text>
      <Text className="legal-p">
        2. 显示用户身份：在日历组成员列表、日程创建者标识等场景显示您的微信昵称与头像。
      </Text>
      <Text className="legal-p">
        3. 改进服务：分析功能使用情况，优化产品体验。我们不会将您的内容用于广告投放。
      </Text>

      <Text className="legal-h">三、第三方服务</Text>
      <Text className="legal-p">
        快速创建日程功能依托第三方文本解析服务。当您使用该功能时，您输入的文本会被发送至该服务进行处理。该服务遵循其自身的隐私政策，请您在使用前知悉。
      </Text>

      <Text className="legal-h">四、信息存储与安全</Text>
      <Text className="legal-p">
        1. 您的信息存储在我们位于中国大陆境内的服务器中，全程通过 HTTPS 加密传输。
      </Text>
      <Text className="legal-p">
        2. 我们采取行业通行的技术与管理手段（如访问控制、密码加密等）保护您的信息，但请您理解互联网环境并非绝对安全。
      </Text>

      <Text className="legal-h">五、信息共享</Text>
      <Text className="legal-p">
        除以下情形外，我们不会将您的信息共享给任何第三方：（1）经您主动加入日历组并选择共享日程，相关日程信息会被该组成员可见；（2）法律法规要求或主管机关合法要求。
      </Text>

      <Text className="legal-h">六、您的权利</Text>
      <Text className="legal-p">
        您可以随时在小程序内：编辑或删除您创建的日程、退出或解散您所在的日历组、退出登录注销本地凭证。如需删除账号及全部相关数据，请通过下方联系方式与我们联系。
      </Text>

      <Text className="legal-h">七、未成年人保护</Text>
      <Text className="legal-p">
        本小程序主要面向成年用户。若您是未成年人，请在监护人指导下使用，并由监护人代为同意本政策。
      </Text>

      <Text className="legal-h">八、政策更新</Text>
      <Text className="legal-p">
        我们可能会适时更新本隐私政策。重大变更将通过小程序公告等方式通知您。
      </Text>

      <Text className="legal-h">九、联系我们</Text>
      <Text className="legal-p">
        如您对本政策有任何疑问、建议或投诉，可通过以下方式与我们联系：
      </Text>
      <Text className="legal-p">邮箱：evan.yu@wisetechglobal.com</Text>
    </View>
  );
}
