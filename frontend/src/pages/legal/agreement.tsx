import { View, Text } from "@tarojs/components";
import "./legal.scss";

export default function AgreementPage() {
  return (
    <View className="legal-page">
      <Text className="legal-title">用户协议</Text>
      <Text className="legal-update">更新日期：2026 年 4 月 25 日</Text>

      <Text className="legal-intro">
        欢迎使用「共享日程」（以下简称"本服务"）。在使用本服务前，请您仔细阅读本协议。您一旦开始使用，即视为同意接受本协议全部条款。
      </Text>

      <Text className="legal-h">一、服务说明</Text>
      <Text className="legal-p">
        本服务是一款基于微信小程序的日程管理工具，提供个人日程记录、家庭/团队共享日历、快速创建日程等功能。
      </Text>

      <Text className="legal-h">二、账号</Text>
      <Text className="legal-p">
        1. 您通过微信授权登录后即获得本服务账号。账号与您的微信身份绑定。
      </Text>
      <Text className="legal-p">
        2. 您应妥善保管自己的微信账号。因您账号被他人盗用导致的损失，由您自行承担。
      </Text>

      <Text className="legal-h">三、用户行为规范</Text>
      <Text className="legal-p">您承诺不会利用本服务从事以下行为：</Text>
      <Text className="legal-p">
        1. 发布、传输任何违反国家法律法规、危害国家安全、煽动民族仇恨、传播淫秽暴力等违法或不良信息。
      </Text>
      <Text className="legal-p">
        2. 侵犯他人知识产权、隐私权、名誉权等合法权益。
      </Text>
      <Text className="legal-p">
        3. 利用本服务发布商业广告、垃圾信息或进行任何形式的网络攻击。
      </Text>
      <Text className="legal-p">
        4. 通过技术手段对服务进行干扰、破坏或反向工程。
      </Text>

      <Text className="legal-h">四、内容与知识产权</Text>
      <Text className="legal-p">
        1. 您在本服务中创建的日程、日历组等内容的所有权归您所有，您对所发布内容承担全部责任。
      </Text>
      <Text className="legal-p">
        2. 本服务的程序代码、界面设计、商标标识等知识产权归本服务方所有。未经授权，您不得复制、修改、传播。
      </Text>

      <Text className="legal-h">五、快速创建功能说明</Text>
      <Text className="legal-p">
        快速创建日程功能使用自然语言解析技术，解析结果可能存在误差，请您在保存前自行核对。我们不对解析结果的准确性作任何明示或默示的担保。
      </Text>

      <Text className="legal-h">六、服务变更与中止</Text>
      <Text className="legal-p">
        我们有权根据业务需要变更、中止或终止部分或全部服务。如发生上述情况，我们将尽可能提前通过小程序公告等方式通知您。
      </Text>

      <Text className="legal-h">七、免责声明</Text>
      <Text className="legal-p">
        1. 在法律允许的最大范围内，本服务以"现状"提供，不对服务的及时性、准确性、不间断性作任何保证。
      </Text>
      <Text className="legal-p">
        2. 因不可抗力、网络中断、第三方原因（含微信平台、第三方服务等）造成的服务异常，我们不承担责任。
      </Text>

      <Text className="legal-h">八、协议变更</Text>
      <Text className="legal-p">
        我们保留随时修改本协议的权利。修改后将通过小程序公告等方式通知您。您继续使用本服务即视为接受修改后的协议。
      </Text>

      <Text className="legal-h">九、法律适用</Text>
      <Text className="legal-p">
        本协议的订立、解释、履行均适用中华人民共和国法律。因本协议产生的争议，应提交本服务方所在地人民法院管辖。
      </Text>

      <Text className="legal-h">十、联系方式</Text>
      <Text className="legal-p">如您有任何疑问，可通过以下方式联系：</Text>
      <Text className="legal-p">邮箱：fihserj@gmail.com</Text>
    </View>
  );
}
