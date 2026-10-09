"use server"
import { NextResponse,NextRequest } from "next/server";


const SUBSCRIPTION_KEY = process.env.SUMHR_KEY || null
let access_token = null
// let clocked_in = false
const systemdetail = "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"

// Enter you user details here
const users = [
    {
        username:"user_mail",
        password:"user_password",
        subscriptionid:"subscription id in number will get from sum hr network call",
        browserdetail:"chrome",
        logintype:1,
        sat_off: false // can change to true if the user has Saturday off or turn off the cron on sat
    }
]

const getPublicIP = async () => {
  const res = await fetch('https://api.ipify.org?format=json');
  const data = await res.json();
  return data.ip;
};

export async function POST(req: NextRequest)
{

    if(!SUBSCRIPTION_KEY)
    {
        console.log("SUMHR_KEY is not set in environment variables");
        return NextResponse.json({ message: "SUMHR_KEY is not set in environment variables" },{status:500});
        
    }

    const body  = await req.json()
    const {request_type}= body

    const today = new Date();
    const dayOfWeek = today.getDay();
    // Sunday Holiday

    if(dayOfWeek === 0)
    {
        return NextResponse.json({ message: "Today is Sunday, no action needed" },{status:200});
        
    }

    // return NextResponse.json({ message: "Test Response" },{status:200});
    

    for (const i of users) 
    {

       if(dayOfWeek === 6 && i.sat_off)
       {
            NextResponse.json({ message: `Today is Saturday and ${i.username} has Saturday off, no action needed` },{status:200});
            console.log(`Today is Saturday and ${i.username} has Saturday off, no action needed`);
            continue;
       }

      // Login
      const Login = await fetch(
        "https://api.sumhr.io:3000/api/subscription/passwordlogin",
        {
          method: "POST",
          headers: {
            Authorization: SUBSCRIPTION_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username:i.username,
            password:i.password,
            subscriptionid:i.subscriptionid,
            browserdetail:i.browserdetail,
            logintype:i.logintype,
            systemdetail:systemdetail
          }),
        },
      );

      const user_details = await Login.json()

      if(user_details.error==null && user_details.result && user_details.result.length>0)
      {
        access_token = user_details.result[0].token

        if(access_token==null)
        {
           NextResponse.json({ message: `Failed to get ${i.username} accesstoken` },{status:401});
           console.log(`Failed to get ${i.username} accesstoken`);
           
           continue;
        }

        // Check if the user is logged in or not
        const now = new Date();

        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");

        const shiftdate = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
        // console.log("Shift Date: " + shiftdate);
        
        const Logs = await fetch(
        "https://api.sumhr.io:3000/api/attendance/allpunchlogbyempid",
        {
          method: "POST",
          headers: {
            Authorization: access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shiftdate: shiftdate
          }),
        },
      );

      
      const log_set = await Logs.json()
      // console.log("Punch Log for " + i.username + ": " + log_set.result.length);

      const ip = await getPublicIP();

      if(log_set.error==null)
      {
        const clocked_in = log_set.result.length % 2 == 0 ? false : true
      
        
        console.log("Complete Report: ")
        console.log("IP Address: ",ip);
        console.log("Clocked In Status: ",clocked_in);
        console.log("Log Set: ",log_set.result.length);
        console.log("Request Type: ",request_type);
        
        

        // If the user is logged in and the current time is after 7 PM, then log out
        if(clocked_in && request_type=="clock_out") 
        {
            try 
            {
              const clockout = await fetch(
                `https://api.sumhr.io:3000/api/attendance/initwebpunch/${ip}`,
                {
                  method: "GET",
                  headers: {
                    Authorization: access_token,
                  },
                },
              );

              const result = await clockout.json();

              if (result.error == null) 
              {
                NextResponse.json({ message: `Successfully logged out ${i.username}` },{status:200});
                console.log(`Successfully logged out ${i.username}`);
                
                continue;
              } 
              else 
             {
                NextResponse.json({ message: `Failed to log out ${i.username}` },{status:400});
                console.log(`Failed to log out ${i.username}`);
                
                continue;
              }
            } 
            catch (error) 
            {
              NextResponse.json({ message: `Error logging out ${i.username}: ${error}` },{status:500});
              console.log(`Error logging out ${i.username}: ${JSON.stringify(error)}`);
              
              continue
            }

        }

        // If the user is logged out and the current time is after 9:50 AM, then log in
        else if(!clocked_in && request_type=="clock_in")
        {
            try
            {
                const clockout = await fetch(`https://api.sumhr.io:3000/api/attendance/initwebpunch/${ip}`,{
                    method:"GET",
                    headers:{
                        Authorization: access_token,
                    }
                })

                const result = await clockout.json()
                if(result.error==null)
                {
                    NextResponse.json({ message: `Successfully logged in ${i.username}` },{status:200});
                    console.log(`Successfully logged in ${i.username}`);
                    
                    continue;
                }
                else
                {
                    NextResponse.json({ message: `Failed to log in ${i.username}` },{status:400});
                    console.log(`Failed to log in ${i.username}`);
                    
                    continue;
                }
            }
            catch(error)
            {
                NextResponse.json({ message: `Error logging in ${i.username}: ${error}` },{status:500});
                console.log(`Error logging in ${i.username}: ${JSON.stringify(error)}`);
                
                continue
                
            }
        }

        else
        {
            NextResponse.json({ message: `No action needed for ${i.username}` },{status:200});
            console.log(`No action needed for ${i.username}`);
            continue;
        }
      }
      else
      {
        NextResponse.json({ message: `Failed to get ${i.username} punchlog` },{status:400});
        console.log(`Failed to get ${i.username} punchlog`);
        continue;
      }

      }
      else
      {
        NextResponse.json({ message: `Failed to login for ${i.username}` },{status:401});
        console.log(`Failed to login for ${i.username}`);
        continue;
      }
    }

    console.log("All users processed");
    return NextResponse.json({ message: "All users processed" },{status:200});


}