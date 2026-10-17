'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isPhone}=require('../web/app/phone-layout.js');
test('phone layout follows native device class, not a tablet split-screen or a narrow desktop window',()=>{
 assert.equal(isPhone({nativeKind:'phone',screenWidth:1080,screenHeight:2400}),true);
 assert.equal(isPhone({nativeKind:'tablet',platform:'pad',screenWidth:360,screenHeight:800}),false);
 assert.equal(isPhone({platform:'pad',screenWidth:844,screenHeight:390}),true);
 assert.equal(isPhone({platform:'pad',screenWidth:390,screenHeight:844}),true);
 assert.equal(isPhone({userAgent:'Android Mobile',screenWidth:600,screenHeight:960}),false);
 assert.equal(isPhone({userAgent:'iPhone',screenWidth:390,screenHeight:844}),true);
 assert.equal(isPhone({userAgent:'Macintosh',screenWidth:390,screenHeight:844}),false);
 assert.equal(isPhone({platform:'pad',screenWidth:0,screenHeight:0}),false);
 assert.equal(isPhone({platform:'pad'}),false);
});
