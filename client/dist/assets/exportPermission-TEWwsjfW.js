const r=t=>{let e=t;if(e===void 0)try{e=JSON.parse(sessionStorage.getItem("user")||"null")}catch{e=null}return!!e&&(e.role==="master_admin"||e.can_export===!0)};export{r as c};
