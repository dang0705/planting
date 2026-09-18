
import { DataModelMethods } from "@cloudbase/wx-cloud-client-sdk";
interface IModalQuestionStrategyV5Real {
/**
 * 所有人
 * 
 */
owner?: string
/**
 * 所属主管部门
 * 
 */
_mainDep?: string
/**
 * 是否启用
 * 是否启用
 */
is_active?: number
/**
 * 提问业务键
 * 提问业务键
 */
question_key: string
/**
 * 触发类型
 * 触发类型
 */
trigger_type?: string
/**
 * 问题组
 * 问题组
 */
question_group_key: string
/**
 * 优先级评分
 * 优先级评分
 */
priority_score?: number
/**
 * 创建时间
 * 
 */
createdAt?: number
/**
 * 创建人
 * 
 */
createBy?: string
/**
 * 修改人
 * 
 */
updateBy?: string
/**
 * 问题业务键
 * 问题业务键
 */
problem_key: string
/**
 * 记录创建者
 * 仅微信云开发下使用
 */
_openid?: string
/**
 * 自增主键
 * 自增主键
 */
id?: number
/**
 * 数据标识
 * 
 */
_id?: string
/**
 * 数据状态
 * 数据状态
 */
data_status?: string
/**
 * 更新时间
 * 
 */
updatedAt?: number
}


interface IModels {

    /**
    * Data Model：问答策略
    */ 
    question_strategy_v5_real: DataModelMethods<IModalQuestionStrategyV5Real>;    
}

declare module "@cloudbase/wx-cloud-client-sdk" {
    interface OrmClient extends IModels {}
}

declare global {
    interface WxCloud {
        models: IModels;
    }
}