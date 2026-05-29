/**
 * 力扣中文站内置静态题单映射
 * 版本：1.1.3
 */

(function () {
    'use strict';

    const modules = window.NoteHelperProblemDataModules = window.NoteHelperProblemDataModules || {};
    const importers = modules.importers = modules.importers || {};

    const LCR_001_TO_119_ROWS = `
LCR 001|xoh6Oh|两数相除|EASY
LCR 002|JFETK5|二进制求和|EASY
LCR 003|w3tCBm|比特位计数|EASY
LCR 004|WGki4K|只出现一次的数字 II|MEDIUM
LCR 005|aseY1I|最大单词长度乘积|MEDIUM
LCR 006|kLl5u1|两数之和 II - 输入有序数组|EASY
LCR 007|1fGaJU|三数之和|MEDIUM
LCR 008|2VG8Kg|长度最小的子数组|MEDIUM
LCR 009|ZVAVXX|乘积小于 K 的子数组|MEDIUM
LCR 010|QTMn0o|和为 K 的子数组|MEDIUM
LCR 011|A1NYOS|连续数组|MEDIUM
LCR 012|tvdfij|寻找数组的中心下标|EASY
LCR 013|O4NDxx|二维区域和检索 - 矩阵不可变|MEDIUM
LCR 014|MPnaiL|字符串的排列|MEDIUM
LCR 015|VabMRr|找到字符串中所有字母异位词|MEDIUM
LCR 016|wtcaE1|无重复字符的最长子串|MEDIUM
LCR 017|M1oyTv|最小覆盖子串|HARD
LCR 018|XltzEq|验证回文串|EASY
LCR 019|RQku0D|验证回文串 II|EASY
LCR 020|a7VOhD|回文子串|MEDIUM
LCR 021|SLwz0R|删除链表的倒数第 N 个结点|MEDIUM
LCR 022|c32eOV|环形链表 II|MEDIUM
LCR 023|3u1WK4|相交链表|EASY
LCR 024|UHnkqh|反转链表|EASY
LCR 025|lMSNwu|两数相加 II|MEDIUM
LCR 026|LGjMqU|重排链表|MEDIUM
LCR 027|aMhZSa|回文链表|EASY
LCR 028|Qv1Da2|扁平化多级双向链表|MEDIUM
LCR 029|4ueAj6|循环有序列表的插入|MEDIUM
LCR 030|FortPu|O(1) 时间插入、删除和获取随机元素|MEDIUM
LCR 031|OrIXps|LRU 缓存|MEDIUM
LCR 032|dKk3P7|有效的字母异位词|EASY
LCR 033|sfvd7V|字母异位词分组|MEDIUM
LCR 034|lwyVBB|验证外星语词典|EASY
LCR 035|569nqc|最小时间差|MEDIUM
LCR 036|8Zf90G|逆波兰表达式求值|MEDIUM
LCR 037|XagZNi|行星碰撞|MEDIUM
LCR 038|iIQa4I|每日温度|MEDIUM
LCR 039|0ynMMM|柱状图中最大的矩形|HARD
LCR 040|PLYXKQ|最大矩形|HARD
LCR 041|qIsx9U|数据流中的移动平均值|EASY
LCR 042|H8086Q|最近的请求次数|EASY
LCR 043|NaqhDT|完全二叉树插入器|MEDIUM
LCR 044|hPov7L|在每个树行中找最大值|MEDIUM
LCR 045|LwUNpT|找树左下角的值|MEDIUM
LCR 046|WNC0Lk|二叉树的右视图|MEDIUM
LCR 047|pOCWxh|二叉树剪枝|MEDIUM
LCR 048|h54YBf|二叉树的序列化与反序列化|HARD
LCR 049|3Etpl5|求根节点到叶节点数字之和|MEDIUM
LCR 050|6eUYwP|路径总和 III|MEDIUM
LCR 051|jC7MId|二叉树中的最大路径和|HARD
LCR 052|NYBBNL|递增顺序搜索树|EASY
LCR 053|P5rCT8|二叉搜索树中的中序后继|MEDIUM
LCR 054|w6cpku|把二叉搜索树转换为累加树|MEDIUM
LCR 055|kTOapQ|二叉搜索树迭代器|MEDIUM
LCR 056|opLdQZ|两数之和 IV - 输入二叉搜索树|EASY
LCR 057|7WqeDu|存在重复元素 III|MEDIUM
LCR 058|fi9suh|我的日程安排表 I|MEDIUM
LCR 059|jBjn9C|数据流中的第 K 大元素|EASY
LCR 060|g5c51o|前 K 个高频元素|MEDIUM
LCR 061|qn8gGX|查找和最小的 K 对数字|MEDIUM
LCR 062|QC3q1f|实现 Trie (前缀树)|MEDIUM
LCR 063|UhWRSj|单词替换|MEDIUM
LCR 064|US1pGT|实现一个魔法字典|MEDIUM
LCR 065|iSwD2y|单词的压缩编码|MEDIUM
LCR 066|z1R5dt|键值映射|MEDIUM
LCR 067|ms70jA|数组中两个数的最大异或值|MEDIUM
LCR 068|N6YdxV|搜索插入位置|EASY
LCR 069|B1IidL|山脉数组的峰顶索引|EASY
LCR 070|skFtm2|有序数组中的单一元素|MEDIUM
LCR 071|cuyjEf|按权重随机选择|MEDIUM
LCR 072|jJ0w9p|x 的平方根|EASY
LCR 073|nZZqjQ|爱吃香蕉的狒狒|MEDIUM
LCR 074|SsGoHC|合并区间|MEDIUM
LCR 075|0H97ZC|数组的相对排序|EASY
LCR 076|xx4gT2|数组中的第 K 个最大元素|MEDIUM
LCR 077|7WHec2|排序链表|MEDIUM
LCR 078|vvXgSW|合并 K 个升序链表|HARD
LCR 079|TVdhkn|子集|MEDIUM
LCR 080|uUsW3B|组合|MEDIUM
LCR 081|Ygoe9J|组合总和|MEDIUM
LCR 082|4sjJUc|组合总和 II|MEDIUM
LCR 083|VvJkup|全排列|MEDIUM
LCR 084|7p8L0Z|全排列 II|MEDIUM
LCR 085|IDBivT|括号生成|MEDIUM
LCR 086|M99OJA|分割回文串|MEDIUM
LCR 087|0on3uN|复原 IP 地址|MEDIUM
LCR 088|GzCJIP|使用最小花费爬楼梯|EASY
LCR 089|Gu0c2T|打家劫舍|MEDIUM
LCR 090|PzWKhm|打家劫舍 II|MEDIUM
LCR 091|JEj789|粉刷房子|MEDIUM
LCR 092|cyJERH|将字符串翻转到单调递增|MEDIUM
LCR 093|Q91FMA|最长的斐波那契子序列的长度|MEDIUM
LCR 094|omKAoA|分割回文串 II|HARD
LCR 095|qJnOS7|最长公共子序列|MEDIUM
LCR 096|IY6buf|交错字符串|MEDIUM
LCR 097|21dk04|不同的子序列|HARD
LCR 098|2AoeFn|不同路径|MEDIUM
LCR 099|0i0mDW|最小路径和|MEDIUM
LCR 100|IlPe0q|三角形最小路径和|MEDIUM
LCR 101|NUPfPr|分割等和子集|EASY
LCR 102|YaVDxD|目标和|MEDIUM
LCR 103|gaM7Ch|零钱兑换|MEDIUM
LCR 104|D0F0SV|组合总和 Ⅳ|MEDIUM
LCR 105|ZL6zAn|岛屿的最大面积|MEDIUM
LCR 106|vEAB3K|判断二分图|MEDIUM
LCR 107|2bCMpM|01 矩阵|MEDIUM
LCR 108|om3reC|单词接龙|HARD
LCR 109|zlDJc7|打开转盘锁|MEDIUM
LCR 110|bcmxV1|所有可能的路径|MEDIUM
LCR 111|fpTFWP|除法求值|MEDIUM
LCR 112|QO5KpG|矩阵中的最长递增路径|HARD
LCR 113|QA2IGt|课程表 II|MEDIUM
LCR 114|Jf1JuT|火星词典|HARD
LCR 115|ur2n8P|重建序列|MEDIUM
LCR 116|bLyHh0|省份数量|MEDIUM
LCR 117|H6lPxb|相似字符串组|HARD
LCR 118|7LpjUW|多余的边|MEDIUM
LCR 119|WhsWhI|最长连续序列|MEDIUM
`;

    const LCR_120_TO_194_ROWS = `
LCR 121|er-wei-shu-zu-zhong-de-cha-zhao-lcof|寻找目标值 - 二维数组|MEDIUM
LCR 120|shu-zu-zhong-zhong-fu-de-shu-zi-lcof|寻找文件副本|EASY
LCR 128|xuan-zhuan-shu-zu-de-zui-xiao-shu-zi-lcof|库存管理 I|EASY
LCR 131|jian-sheng-zi-lcof|砍竹子 I|MEDIUM
LCR 132|jian-sheng-zi-ii-lcof|砍竹子 II|MEDIUM
LCR 135|da-yin-cong-1dao-zui-da-de-nwei-shu-lcof|报数|EASY
LCR 139|diao-zheng-shu-zu-shun-xu-shi-qi-shu-wei-yu-ou-shu-qian-mian-lcof|训练计划 I|EASY
LCR 158|shu-zu-zhong-chu-xian-ci-shu-chao-guo-yi-ban-de-shu-zi-lcof|库存管理 II|EASY
LCR 159|zui-xiao-de-kge-shu-lcof|库存管理 III|EASY
LCR 160|shu-ju-liu-zhong-de-zhong-wei-shu-lcof|数据流中的中位数|HARD
LCR 164|ba-shu-zu-pai-cheng-zui-xiao-de-shu-lcof|破解闯关密码|MEDIUM
LCR 168|chou-shu-lcof|丑数|MEDIUM
LCR 170|shu-zu-zhong-de-ni-xu-dui-lcof|交易逆序对的总数|HARD
LCR 172|zai-pai-xu-shu-zu-zhong-cha-zhao-shu-zi-lcof|统计目标成绩的出现次数|EASY
LCR 173|que-shi-de-shu-zi-lcof|点名|EASY
LCR 179|he-wei-sde-liang-ge-shu-zi-lcof|查找总价格为目标值的两个商品|EASY
LCR 180|he-wei-sde-lian-xu-zheng-shu-xu-lie-lcof|文件组合|EASY
LCR 183|hua-dong-chuang-kou-de-zui-da-zhi-lcof|望远镜中最高的海拔|HARD
LCR 186|bu-ke-pai-zhong-de-shun-zi-lcof|文物朝代判断|EASY
LCR 189|qiu-12n-lcof|设计机械累加器|MEDIUM
LCR 191|gou-jian-cheng-ji-shu-zu-lcof|按规则计算统计结果|EASY
LCR 122|ti-huan-kong-ge-lcof|路径加密|EASY
LCR 138|biao-shi-shu-zhi-de-zi-fu-chuan-lcof|有效数字|HARD
LCR 157|zi-fu-chuan-de-pai-lie-lcof|套餐内商品的排列顺序|MEDIUM
LCR 167|di-yi-ge-zhi-chu-xian-yi-ci-de-zi-fu-lcof|招式拆解 I|EASY
LCR 169|di-yi-ge-zhi-chu-xian-yi-ci-de-zi-fu-lcof-fpzr0f|招式拆解 II|MEDIUM
LCR 181|fan-zhuan-dan-ci-shun-xu-lcof|字符串中的单词反转|EASY
LCR 182|zuo-xuan-zhuan-zi-fu-chuan-lcof|动态口令|EASY
LCR 192|ba-zi-fu-chuan-zhuan-huan-cheng-zheng-shu-lcof|把字符串转换成整数 (atoi)|MEDIUM
LCR 123|cong-wei-dao-tou-da-yin-lian-biao-lcof|图书整理 I|EASY
LCR 136|shan-chu-lian-biao-de-jie-dian-lcof|删除链表的节点|EASY
LCR 140|lian-biao-zhong-dao-shu-di-kge-jie-dian-lcof|训练计划 II|EASY
LCR 141|fan-zhuan-lian-biao-lcof|训练计划 III|EASY
LCR 142|lian-biao-zhong-huan-de-ru-kou-jie-dian-lcof|训练计划 IV|MEDIUM
LCR 171|liang-ge-lian-biao-de-di-yi-ge-gong-gong-jie-dian-lcof|训练计划 V|EASY
LCR 154|fu-za-lian-biao-de-fu-zhi-lcof|随机链表的复制|MEDIUM
LCR 147|bao-han-minhan-shu-de-zhan-lcof|最小栈|EASY
LCR 125|yong-liang-ge-zhan-shi-xian-dui-lie-lcof|图书整理 II|EASY
LCR 184|dui-lie-de-zui-da-zhi-lcof|设计自助结算系统|MEDIUM
LCR 148|zhan-de-ya-ru-dan-chu-xu-lie-lcof|验证图书取出顺序|MEDIUM
LCR 124|zhong-jian-er-cha-shu-lcof|推理二叉树|MEDIUM
LCR 143|er-cha-shu-de-zi-jie-gou-lcof|子结构判断|MEDIUM
LCR 144|fan-zhuan-er-cha-shu-lcof|翻转二叉树|EASY
LCR 145|dui-cheng-de-er-cha-shu-lcof|判断对称二叉树|EASY
LCR 149|cong-shang-dao-xia-da-yin-er-cha-shu-ii-lcof|彩灯装饰记录 I|MEDIUM
LCR 150|cong-shang-dao-xia-da-yin-er-cha-shu-iii-lcof|彩灯装饰记录 II|MEDIUM
LCR 151|cong-shang-dao-xia-da-yin-er-cha-shu-iv-lcof|彩灯装饰记录 III|MEDIUM
LCR 152|er-cha-sou-suo-shu-de-hou-xu-bian-li-xu-lie-lcof|验证二叉搜索树的后序遍历序列|MEDIUM
LCR 153|er-cha-shu-zhong-he-wei-mou-yi-zhi-de-lu-jing-lcof|二叉树中和为目标值的路径|MEDIUM
LCR 155|er-cha-sou-suo-shu-yu-shuang-xiang-lian-biao-lcof|将二叉搜索树转化为排序的双向链表|MEDIUM
LCR 156|xu-lie-hua-er-cha-shu-lcof|序列化与反序列化二叉树|HARD
LCR 174|er-cha-sou-suo-shu-de-di-kda-jie-dian-lcof|寻找二叉搜索树中的目标节点|EASY
LCR 175|er-cha-shu-de-shen-du-lcof|计算二叉树的深度|EASY
LCR 176|ping-heng-er-cha-shu-lcof|判断是否为平衡二叉树|EASY
LCR 193|er-cha-sou-suo-shu-de-zui-jin-gong-gong-zu-xian-lcof|求二叉搜索树的最近公共祖先|EASY
LCR 194|er-cha-shu-de-zui-jin-gong-gong-zu-xian-lcof|寻找二叉树的最近公共祖先|MEDIUM
LCR 133|er-jin-zhi-zhong-1de-ge-shu-lcof|位 1 的个数|EASY
LCR 134|shu-zhi-de-zheng-shu-ci-fang-lcof|Pow(x, n)|MEDIUM
LCR 177|da-yin-cong-1dao-zui-da-de-nwei-shu-lcof-1|撞色搭配|EASY
LCR 178|diao-zheng-shu-zu-shun-xu-shi-qi-shu-wei-yu-ou-shu-qian-mian-lcof-1|训练计划 VI|EASY
LCR 190|jia-fa-bu-yong-jia-jian-cheng-chu-zuo-jia-fa-lcof|加密运算|MEDIUM
LCR 126|fei-bo-na-qi-shu-lie-lcof|斐波那契数|EASY
LCR 127|qing-wa-tiao-tai-jie-wen-ti-lcof|跳跃训练|EASY
LCR 137|zheng-ze-biao-da-shi-pi-pei-lcof|模糊搜索验证|HARD
LCR 161|lian-xu-zi-shu-zu-de-zui-da-he-lcof|连续天数的最高销售额|EASY
LCR 165|ba-shu-zi-fan-yi-cheng-zi-fu-chuan-lcof|解密数字|MEDIUM
LCR 166|li-wu-de-zui-da-jie-zhi-lcof|珠宝的最高价值|MEDIUM
LCR 185|nge-tou-zi-de-dian-shu-lcof|统计结果概率|MEDIUM
LCR 187|yuan-quan-zhong-zui-hou-sheng-xia-de-shu-zi-lcof|破冰游戏|EASY
LCR 129|ju-zhen-zhong-de-lu-jing-lcof|字母迷宫|MEDIUM
LCR 130|ji-qi-ren-de-yun-dong-fan-wei-lcof|衣橱整理|MEDIUM
LCR 146|shun-shi-zhen-da-yin-ju-zhen-lcof|螺旋遍历二维数组|EASY
LCR 188|gu-piao-de-zui-da-li-run-lcof|买卖芯片的最佳时机|MEDIUM
LCR 162|1nzheng-shu-zhong-1chu-xian-de-ci-shu-lcof|数字 1 的个数|HARD
LCR 163|shu-zi-xu-lie-zhong-mou-yi-wei-de-shu-zi-lcof|找到第 k 位数字|MEDIUM
`;

    const BUILTIN_LISTS = {
        lcr001to119: {
            listId: 'lc-cn:static:lcr-001-119',
            sourceType: 'leetcode_builtin_static',
            sourceUrl: 'https://leetcode.cn/problem-list/h0pfVB6V/',
            title: '剑指 Offer 专项突破（LCR 001 - 119）',
            site: 'leetcode.cn',
            rows: LCR_001_TO_119_ROWS
        },
        lcr120to194: {
            listId: 'lc-cn:static:lcr-120-194',
            sourceType: 'leetcode_builtin_static',
            sourceUrl: '',
            title: '剑指 Offer 第 2 版（LCR 120 - 194）',
            site: 'leetcode.cn',
            rows: LCR_120_TO_194_ROWS
        }
    };

    function buildProblemBaseUrl(titleSlug) {
        return `https://leetcode.cn/problems/${titleSlug}/`;
    }

    function extractFrontendQuestionOrder(frontendQuestionId) {
        const match = String(frontendQuestionId || '').match(/LCR\s*(\d+)/i);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    function parseRows(rowsText) {
        return String(rowsText || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [frontendQuestionId, titleSlug, title, difficulty] = line.split('|');
                const baseUrl = buildProblemBaseUrl(titleSlug);
                return {
                    frontendQuestionId,
                    titleSlug,
                    title,
                    translatedTitle: title,
                    difficulty,
                    url: baseUrl,
                    baseUrl,
                    canonicalId: `leet:${titleSlug}`
                };
            })
            .sort((left, right) => extractFrontendQuestionOrder(left.frontendQuestionId) - extractFrontendQuestionOrder(right.frontendQuestionId));
    }

    function cloneItems(listKey, rowsText) {
        return parseRows(rowsText).map((item, index) => ({
            ...item,
            order: index + 1,
            sourceContext: {
                source: 'builtin_static',
                listKey
            },
            sourceSection: null,
            topics: []
        }));
    }

    async function importByKey(listKey) {
        const config = BUILTIN_LISTS[listKey];
        if (!config) {
            const error = new Error('当前内置题单不存在。');
            error.code = 'builtin_list_not_found';
            throw error;
        }

        const now = new Date().toISOString();
        return {
            listId: config.listId,
            sourceType: config.sourceType,
            sourceUrl: config.sourceUrl,
            title: config.title,
            site: config.site,
            importedAt: now,
            updatedAt: now,
            items: cloneItems(listKey, config.rows)
        };
    }

    importers.staticCnLists = {
        importByKey
    };
})();
