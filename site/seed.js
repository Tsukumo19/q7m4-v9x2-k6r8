export const initial = {
  players: [
    ['griggo','格里戈',13,60],['bernardo','贝尔纳多',3,null],['elias','埃利亚斯',-.5,null],['isabel','伊莎贝尔',-2,null],['hector','赫克托',-2,null],['rosa','罗莎',-2.5,null],['toby','托比',-4,null],['martin','马丁',-5,null]
  ].map(([id,name,net_gp,max_score])=>({id,name,net_gp,max_score,appearances:null,gambles:null,history_complete:false})),
  matches: [], notices: ['托比对赫克托：尚未投骰，不计入已完成场次。','格里戈曾公布 60 点。该历史局已含在余额快照中，不重复结算。']
};
